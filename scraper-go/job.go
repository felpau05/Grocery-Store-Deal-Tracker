package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// JobStatus mirrors the Python service.py._state shape, reframed as a
// per-job record with an id instead of a single global slot.
type JobStatus string

const (
	StatusRunning JobStatus = "running"
	StatusDone    JobStatus = "done"
	StatusFailed  JobStatus = "failed"
)

type Job struct {
	ID            string    `json:"job_id"`
	PostalCode    string    `json:"postal_code"`
	MerchantCount int       `json:"merchant_count"`
	Status        JobStatus `json:"status"`
	StartedAt     time.Time `json:"started_at"`
	FinishedAt    time.Time `json:"finished_at,omitzero"`
	ItemsScraped  int       `json:"items_scraped"`
	Err           string    `json:"error,omitempty"`
}

// jobStore is a single-flight guard + job history backed by Redis, so
// the guard holds across N scraper-go replicas behind a load balancer
// — not just within one process, which an in-memory version couldn't
// guarantee. Keys:
//
//	scraper:lock:current      -> job ID of the in-flight scrape (SETNX'd)
//	scraper:job:<job_id>      -> JSON-encoded Job
//	scraper:latest:<postal>   -> job ID of the most recent job for that postal code
const (
	lockKey    = "scraper:lock:current"
	jobLockTTL = 30 * time.Minute // safety net if a process dies mid-scrape without calling finish
	jobTTL     = 24 * time.Hour   // status-polling/debugging lifetime
)

func jobKey(id string) string        { return "scraper:job:" + id }
func latestKey(postal string) string { return "scraper:latest:" + postal }

// releaseLockScript is the standard Redis distributed-lock release
// pattern: only delete the lock if it still holds OUR job ID. Without
// this, a `finish()` that runs after the lock's TTL already expired
// (and someone else legitimately claimed it) would delete the NEW
// claimant's lock instead of a stale one of its own.
var releaseLockScript = redis.NewScript(`
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0
end
`)

type jobStore struct {
	rdb *redis.Client
}

func newJobStore(rdb *redis.Client) *jobStore {
	return &jobStore{rdb: rdb}
}

// tryStart returns (in-flight job, false, nil) if a scrape is already
// running anywhere — global single-flight, not per-postal-code, same
// as the free-tier DB budget's tolerance for concurrent scrapes. On a
// Redis error, returns a non-nil error and the caller must refuse to
// start the scrape (fail closed) — silently falling back to "allow it"
// would reintroduce the exact concurrent-scrape bug this guards against.
func (s *jobStore) tryStart(ctx context.Context, postal string, merchantCount int) (*Job, bool, error) {
	j := &Job{
		ID:            uuid.NewString(),
		PostalCode:    postal,
		MerchantCount: merchantCount,
		Status:        StatusRunning,
		StartedAt:     time.Now().UTC(),
	}

	ok, err := s.rdb.SetNX(ctx, lockKey, j.ID, jobLockTTL).Result()
	if err != nil {
		return nil, false, fmt.Errorf("claim job lock: %w", err)
	}
	if !ok {
		currentID, err := s.rdb.Get(ctx, lockKey).Result()
		if err == nil {
			if existing, found := s.byIDLookup(ctx, currentID); found {
				return existing, false, nil
			}
		}
		// Lock key exists but its job record is missing/expired (a rare
		// TTL race) — report "busy" without guessing at details rather
		// than fabricating a fake job.
		return &Job{Status: StatusRunning}, false, nil
	}

	body, err := json.Marshal(j)
	if err != nil {
		_ = s.releaseLock(ctx, j.ID)
		return nil, false, fmt.Errorf("marshal job: %w", err)
	}
	if err := s.rdb.Set(ctx, jobKey(j.ID), body, jobTTL).Err(); err != nil {
		_ = s.releaseLock(ctx, j.ID) // don't leave a 30-minute phantom lock behind
		return nil, false, fmt.Errorf("persist job: %w", err)
	}
	if err := s.rdb.Set(ctx, latestKey(postal), j.ID, jobTTL).Err(); err != nil {
		// Job record is durable and the lock is held correctly — only the
		// postal->id pointer failed. Not worth unwinding the claim over;
		// latestForPostal degrades to "not found" for this postal code
		// until the next scrape, a status-read inconvenience, not a
		// correctness bug.
		log.Printf("jobStore: tryStart: set latest pointer for %s: %v", postal, err)
	}
	return j, true, nil
}

func (s *jobStore) releaseLock(ctx context.Context, jobID string) error {
	return releaseLockScript.Run(ctx, s.rdb, []string{lockKey}, jobID).Err()
}

// finish is fire-and-forget by design — called from the background
// scrape goroutine after the HTTP response is already sent, so there's
// nothing meaningful to do with a Redis error except log it. Worst
// case the lock self-heals via its TTL.
func (s *jobStore) finish(ctx context.Context, j *Job, itemsScraped int, scrapeErr error) {
	j.FinishedAt = time.Now().UTC()
	j.ItemsScraped = itemsScraped
	if scrapeErr != nil {
		j.Status = StatusFailed
		j.Err = truncateError(scrapeErr, 300)
	} else {
		j.Status = StatusDone
	}

	body, err := json.Marshal(j)
	if err != nil {
		log.Printf("jobStore: finish: marshal job %s: %v", j.ID, err)
	} else if err := s.rdb.Set(ctx, jobKey(j.ID), body, jobTTL).Err(); err != nil {
		log.Printf("jobStore: finish: persist job %s: %v", j.ID, err)
	}
	if err := s.releaseLock(ctx, j.ID); err != nil {
		log.Printf("jobStore: finish: release lock for job %s: %v", j.ID, err)
	}
}

// byIDLookup and latestForPostal are lenient reads — any Redis error
// or missing key just becomes "not found", which both HTTP handlers
// already turn into a 404. A Redis blip here surfaces as a normal
// 404, not a 500.
func (s *jobStore) byIDLookup(ctx context.Context, id string) (*Job, bool) {
	val, err := s.rdb.Get(ctx, jobKey(id)).Result()
	if err != nil {
		if err != redis.Nil {
			log.Printf("jobStore: byIDLookup(%s): %v", id, err)
		}
		return nil, false
	}
	var j Job
	if err := json.Unmarshal([]byte(val), &j); err != nil {
		log.Printf("jobStore: byIDLookup(%s): corrupt record: %v", id, err)
		return nil, false
	}
	return &j, true
}

func (s *jobStore) latestForPostal(ctx context.Context, postal string) (*Job, bool) {
	id, err := s.rdb.Get(ctx, latestKey(postal)).Result()
	if err != nil {
		if err != redis.Nil {
			log.Printf("jobStore: latestForPostal(%s): %v", postal, err)
		}
		return nil, false
	}
	return s.byIDLookup(ctx, id)
}

func truncateError(err error, n int) string {
	s := err.Error()
	if len(s) > n {
		return s[:n]
	}
	return s
}
