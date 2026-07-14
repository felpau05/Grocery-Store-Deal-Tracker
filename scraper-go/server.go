package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type scrapeRequest struct {
	PostalCode  string  `json:"postal_code"`
	MerchantIDs []int64 `json:"merchant_ids"`
}

// authMiddleware checks a static shared-secret header — these
// endpoints are server-to-server only (Python's FastAPI backend),
// never called from a browser, so no CORS/session auth is needed.
func authMiddleware(token string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if token != "" && r.Header.Get("X-Scraper-Token") != token {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// handleStartScrape ports the trigger side of what Python's
// PUT /me/preferences used to call directly (run_background_scrape).
// Returns immediately — the scrape itself runs in a background
// goroutine — mirroring FastAPI's BackgroundTasks semantics.
func handleStartScrape(js *jobStore, pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body scrapeRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}
		if body.PostalCode == "" || len(body.MerchantIDs) == 0 {
			http.Error(w, "postal_code and merchant_ids are required", http.StatusUnprocessableEntity)
			return
		}

		job, started, err := js.tryStart(r.Context(), body.PostalCode, len(body.MerchantIDs))
		if err != nil {
			log.Printf("tryStart(%s): %v", body.PostalCode, err)
			http.Error(w, "job store unavailable", http.StatusServiceUnavailable)
			return
		}
		if !started {
			writeJSON(w, http.StatusConflict, jobResponse(job))
			return
		}

		validMerchants := make(map[int64]bool, len(body.MerchantIDs))
		for _, id := range body.MerchantIDs {
			validMerchants[id] = true
		}

		go func(job *Job) {
			// Deliberately context.Background(), not the request's
			// context — the HTTP response has already been written by
			// the time this runs; the scrape must outlive the request.
			bgCtx := context.Background()
			saved, err := runScrape(bgCtx, pool, job.PostalCode, validMerchants)
			js.finish(bgCtx, job, saved, err)
			if err != nil {
				log.Printf("scrape %s failed: %v", job.PostalCode, err)
			}
		}(job)

		writeJSON(w, http.StatusAccepted, jobResponse(job))
	}
}

func handleGetJob(js *jobStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		job, ok := js.byIDLookup(r.Context(), id)
		if !ok {
			http.Error(w, "job not found", http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, jobResponse(job))
	}
}

// handleLatestJob lets Python recover status after a process restart
// loses its in-memory postal_code -> job_id cache.
func handleLatestJob(js *jobStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		postal := r.URL.Query().Get("postal_code")
		if postal == "" {
			http.Error(w, "postal_code query param is required", http.StatusBadRequest)
			return
		}
		job, ok := js.latestForPostal(r.Context(), postal)
		if !ok {
			http.Error(w, "no job found for postal_code", http.StatusNotFound)
			return
		}
		writeJSON(w, http.StatusOK, jobResponse(job))
	}
}

type jobResp struct {
	JobID         string `json:"job_id"`
	PostalCode    string `json:"postal_code"`
	MerchantCount int    `json:"merchant_count"`
	Status        string `json:"status"`
	StartedAt     string `json:"started_at"`
	FinishedAt    string `json:"finished_at,omitempty"`
	ItemsScraped  int    `json:"items_scraped"`
	Error         string `json:"error,omitempty"`
}

func jobResponse(j *Job) jobResp {
	resp := jobResp{
		JobID: j.ID, PostalCode: j.PostalCode, MerchantCount: j.MerchantCount,
		Status: string(j.Status), StartedAt: j.StartedAt.Format(time.RFC3339),
		ItemsScraped: j.ItemsScraped, Error: j.Err,
	}
	if !j.FinishedAt.IsZero() {
		resp.FinishedAt = j.FinishedAt.Format(time.RFC3339)
	}
	return resp
}
