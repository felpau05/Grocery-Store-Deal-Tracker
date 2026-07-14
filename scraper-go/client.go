package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/rand"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// Port of backend/flipp_scraper/client.py — the Flipp HTTP client.

const (
	flyersURL         = "https://backflipp.wishabi.com/flipp/flyers"
	itemDetailURL     = "https://dam.flippenterprise.net/api/flipp/flyer_items"
	merchantsListURL  = "https://backflipp.wishabi.com/flipp/merchants"
	maxRetries        = 3
	detailConcurrency = 8
)

var flippHeaders = map[string]string{
	"Accept":     "application/json",
	"Referer":    "https://flipp.com/",
	"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
}

func newFlippHTTPClient(concurrency int) *http.Client {
	return &http.Client{
		Timeout: 35 * time.Second, // Python: connect 10s, read/write/pool 30s
		Transport: &http.Transport{
			MaxConnsPerHost:     concurrency,
			MaxIdleConnsPerHost: concurrency,
		},
	}
}

func generateSid() string {
	digits := make([]byte, 16)
	for i := range digits {
		digits[i] = byte('0' + rand.Intn(10))
	}
	return string(digits)
}

// requestJSON ports _request_json: GET with retries, exponential
// backoff, and rate-limit handling. Retries on HTTP 429, HTTP 5xx,
// timeouts/transport errors, and non-object JSON bodies. A non-429/5xx
// HTTP error status is NOT retried — it propagates immediately, same
// as Python's raise_for_status() escaping the narrow except clause.
func requestJSON(ctx context.Context, hc *http.Client, rawURL string, params map[string]string) (map[string]any, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	q := u.Query()
	for k, v := range params {
		q.Set(k, v)
	}
	u.RawQuery = q.Encode()

	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
		if err != nil {
			return nil, err
		}
		for k, v := range flippHeaders {
			req.Header.Set(k, v)
		}

		resp, err := hc.Do(req)
		if err != nil {
			lastErr = err
			if attempt == maxRetries-1 {
				break
			}
			sleepBackoff(ctx, attempt)
			continue
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			delay := retryAfterDelay(resp.Header.Get("Retry-After"), attempt)
			resp.Body.Close()
			if !sleepFor(ctx, delay) {
				return nil, ctx.Err()
			}
			continue
		}

		if resp.StatusCode >= 500 && resp.StatusCode < 600 {
			resp.Body.Close()
			sleepBackoff(ctx, attempt)
			continue
		}

		if resp.StatusCode >= 400 {
			resp.Body.Close()
			return nil, fmt.Errorf("flipp request failed: %s: HTTP %d", rawURL, resp.StatusCode)
		}

		body, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			lastErr = readErr
			if attempt == maxRetries-1 {
				break
			}
			sleepBackoff(ctx, attempt)
			continue
		}

		var data any
		if err := json.Unmarshal(body, &data); err != nil {
			lastErr = err
			if attempt == maxRetries-1 {
				break
			}
			sleepBackoff(ctx, attempt)
			continue
		}
		obj, ok := data.(map[string]any)
		if !ok {
			lastErr = fmt.Errorf("expected JSON object from %s", rawURL)
			if attempt == maxRetries-1 {
				break
			}
			sleepBackoff(ctx, attempt)
			continue
		}
		return obj, nil
	}
	return nil, fmt.Errorf("request failed after %d attempts: %s: %w", maxRetries, rawURL, lastErr)
}

func retryAfterDelay(raw string, attempt int) time.Duration {
	if raw != "" {
		if secs, err := strconv.ParseFloat(raw, 64); err == nil {
			return time.Duration(secs * float64(time.Second))
		}
	}
	return backoffDuration(attempt)
}

func backoffDuration(attempt int) time.Duration {
	return time.Duration(math.Pow(2, float64(attempt))) * time.Second
}

func sleepBackoff(ctx context.Context, attempt int) {
	sleepFor(ctx, backoffDuration(attempt))
}

func sleepFor(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return true
	case <-ctx.Done():
		return false
	}
}

func asMapSlice(v any) []map[string]any {
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(list))
	for _, item := range list {
		if m, ok := item.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out
}

// fetchFlyers ports fetch_flyers: every active flyer for a postal code.
func fetchFlyers(ctx context.Context, hc *http.Client, postalCode string) ([]map[string]any, error) {
	data, err := requestJSON(ctx, hc, flyersURL, map[string]string{"locale": "en-ca", "postal_code": postalCode})
	if err != nil {
		return nil, err
	}
	rawFlyers, ok := data["flyers"].([]any)
	if !ok {
		return nil, fmt.Errorf("flipp response did not contain a valid 'flyers' list")
	}
	out := make([]map[string]any, 0, len(rawFlyers))
	for _, f := range rawFlyers {
		if m, ok := f.(map[string]any); ok {
			out = append(out, m)
		}
	}
	return out, nil
}

// fetchMerchants ports fetch_merchants: every merchant Flipp knows
// about for a postal code.
func fetchMerchants(ctx context.Context, hc *http.Client, postalCode string) ([]map[string]any, error) {
	data, err := requestJSON(ctx, hc, merchantsListURL, map[string]string{"postal_code": postalCode})
	if err != nil {
		return nil, err
	}
	if _, ok := data["merchants"].([]any); !ok {
		return nil, fmt.Errorf("flipp response did not contain a valid 'merchants' list")
	}
	return asMapSlice(data["merchants"]), nil
}

// fetchFlyerItems ports fetch_flyer_items: basic item list for one
// flyer, with the same "wrong flyer" data-integrity check.
func fetchFlyerItems(ctx context.Context, hc *http.Client, flyerID int64, postalCode string) ([]RawItem, error) {
	data, err := requestJSON(ctx, hc, fmt.Sprintf("%s/%d", flyersURL, flyerID),
		map[string]string{"locale": "en-ca", "postal_code": postalCode})
	if err != nil {
		return nil, err
	}
	rawItems, ok := data["items"].([]any)
	if !ok {
		return nil, fmt.Errorf("flyer %d response did not contain an 'items' list", flyerID)
	}
	out := make([]RawItem, 0, len(rawItems))
	for _, it := range rawItems {
		m, ok := it.(map[string]any)
		if !ok {
			continue
		}
		if fid, has := m["flyer_id"]; has && fid != nil {
			if int64(toFloat64(fid)) != flyerID {
				return nil, fmt.Errorf("flyer %d returned items belonging to another flyer", flyerID)
			}
		}
		out = append(out, RawItem(m))
	}
	return out, nil
}

func toFloat64(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int64:
		return float64(n)
	case int:
		return float64(n)
	}
	return 0
}

// fetchItemDetail ports fetch_item_detail: full detail/popup metadata
// for one flyer item.
func fetchItemDetail(ctx context.Context, hc *http.Client, itemID int64, postalCode, sid string) (map[string]any, error) {
	data, err := requestJSON(ctx, hc, fmt.Sprintf("%s/%d", itemDetailURL, itemID),
		map[string]string{"locale": "en", "postal_code": postalCode, "sid": sid})
	if err != nil {
		return nil, err
	}
	if returnedID, ok := data["id"]; ok && returnedID != nil {
		if int64(toFloat64(returnedID)) != itemID {
			return nil, fmt.Errorf("requested item %d, but flipp returned %v", itemID, returnedID)
		}
	}
	return data, nil
}

// enrichItems ports enrich_items: fetch detail metadata for many items
// concurrently, bounded by a semaphore (goroutines + buffered channel,
// Go's equivalent of asyncio.Semaphore). If a single detail request
// fails, the original basic item is kept — nothing is lost.
func enrichItems(ctx context.Context, hc *http.Client, rawItems []RawItem, postalCode, sid string, concurrency int) []RawItem {
	out := make([]RawItem, len(rawItems))
	sem := make(chan struct{}, concurrency)
	done := make(chan int, len(rawItems))

	for i, raw := range rawItems {
		go func(i int, raw RawItem) {
			sem <- struct{}{}
			defer func() { <-sem; done <- i }()

			idVal, has := raw["id"]
			if !has || idVal == nil {
				out[i] = raw
				return
			}
			itemID := int64(toFloat64(idVal))
			detail, err := fetchItemDetail(ctx, hc, itemID, postalCode, sid)
			if err != nil {
				out[i] = raw
				return
			}
			merged := make(RawItem, len(raw)+len(detail))
			for k, v := range raw {
				merged[k] = v
			}
			for k, v := range detail {
				merged[k] = v
			}
			out[i] = merged
		}(i, raw)
	}
	for range rawItems {
		<-done
	}
	return out
}

// filterFlyers ports filter_flyers: keep only flyers from the
// configured merchant list.
func filterFlyers(flyers []map[string]any, validMerchants map[int64]bool) []map[string]any {
	out := make([]map[string]any, 0, len(flyers))
	for _, f := range flyers {
		if id, ok := f["merchant_id"]; ok && validMerchants[int64(toFloat64(id))] {
			out = append(out, f)
		}
	}
	return out
}

// filterMerchants ports filter_merchants: keep only wanted merchants.
func filterMerchants(merchants []map[string]any, validMerchants map[int64]bool) []map[string]any {
	out := make([]map[string]any, 0, len(merchants))
	for _, m := range merchants {
		if id, ok := m["id"]; ok && validMerchants[int64(toFloat64(id))] {
			out = append(out, m)
		}
	}
	return out
}
