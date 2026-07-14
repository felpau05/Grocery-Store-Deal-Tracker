package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"
	"github.com/redis/go-redis/v9"
)

func main() {
	// Best-effort — same convenience as Python's load_dotenv(): a
	// missing .env is fine (production injects real env vars), so the
	// error is deliberately ignored rather than fatal.
	_ = godotenv.Load()

	ctx := context.Background()

	pool, err := newPgxPool(ctx)
	if err != nil {
		log.Fatalf("db pool: %v", err)
	}
	defer pool.Close()

	// Fail fast, unlike the DB-unreachable-at-runtime tolerance elsewhere
	// — the single-flight scrape guard's entire correctness guarantee
	// depends on Redis, so booting into a broken state and discovering it
	// on the first POST /jobs/scrape (as a 503) is worse than refusing to
	// boot at all. No in-memory fallback: this service now requires Redis
	// even for solo local dev.
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		log.Fatalf("REDIS_URL is not set")
	}
	redisOpt, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("parse REDIS_URL: %v", err)
	}
	rdb := redis.NewClient(redisOpt)
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Fatalf("redis ping: %v", err)
	}
	defer rdb.Close()

	js := newJobStore(rdb)
	token := os.Getenv("SCRAPER_SERVICE_TOKEN")
	if token == "" {
		log.Println("WARNING: SCRAPER_SERVICE_TOKEN is not set — /jobs endpoints are unauthenticated")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /jobs/scrape", authMiddleware(token, handleStartScrape(js, pool)))
	mux.HandleFunc("GET /jobs/latest", authMiddleware(token, handleLatestJob(js)))
	mux.HandleFunc("GET /jobs/{id}", authMiddleware(token, handleGetJob(js)))
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})

	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = ":8080"
	}

	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	log.Printf("scraper-go listening on %s", addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server: %v", err)
	}
}
