// Command tribo is the single binary: REST API + MCP server + sync engine +
// embedded React frontend.
package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"os"
	"time"

	"tribo/internal/api"
	"tribo/internal/assistant"
	"tribo/internal/auth"
	"tribo/internal/calsync"
	"tribo/internal/chores"
	"tribo/internal/store"
	"tribo/web"
)

func main() {
	dbPath := getenv("DATABASE_PATH", "tribo.db")
	addr := getenv("LISTEN_ADDR", ":8080")

	db, err := store.Open(dbPath)
	if err != nil {
		log.Fatalf("store: %v", err)
	}
	defer db.Close()

	authSvc := auth.New(db)
	syncEngine := calsync.NewEngine(db)
	// Calendars hard-require a Radicale backend. When configured, provision the
	// managed collections, materialize birthdays, and run sync; otherwise calendar
	// features stay disabled (the rest of the app still works).
	if syncEngine.RadicaleEnabled() {
		if err := syncEngine.EnsureManagedCalendars(context.Background()); err != nil {
			log.Printf("calendar provisioning: %v", err)
		}
		if err := syncEngine.RefreshBirthdays(context.Background()); err != nil {
			log.Printf("birthday generation: %v", err)
		}
		// One-time: move any legacy internal-source events onto Radicale.
		if err := syncEngine.MigrateInternalToRadicale(context.Background()); err != nil {
			log.Printf("calendar migration: %v", err)
		}
		syncEngine.Start(context.Background())
	} else {
		log.Printf("calendars: RADICALE_URL unset — calendar backend disabled")
	}

	// Generates chore instances on a schedule and (when calendars are on) projects
	// them onto the Chores calendar.
	startChoreScheduler(db, syncEngine)

	// AI briefs: nightly generation when an LLM backend is configured.
	startAssistantScheduler(db)

	handler := api.NewHandler(db, web.FS(), authSvc, syncEngine)

	log.Printf("tribo listening on %s (db: %s)", addr, dbPath)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("server: %v", err)
	}
}

// startChoreScheduler generates the upcoming period's chore instances on startup
// and then once a day (the in-process "nightly job" from the architecture doc).
func startChoreScheduler(db *sql.DB, sync *calsync.Engine) {
	svc := chores.NewService(db)
	gen := func() {
		now := time.Now()
		// Generate from a week back (catch-up) through one week ahead.
		if n, err := svc.Generate(now.AddDate(0, 0, -7), now.AddDate(0, 0, 7)); err != nil {
			log.Printf("chore generation: %v", err)
		} else if n > 0 {
			log.Printf("chore generation: created %d instance(s)", n)
		}
		if sync.RadicaleEnabled() {
			if err := sync.ProjectChores(context.Background()); err != nil {
				log.Printf("chore projection: %v", err)
			}
		}
	}
	gen()
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			gen()
		}
	}()
}

// startAssistantScheduler generates the day brief (and the week brief) once a
// day. On startup it only fills gaps — a restart never burns an extra LLM call
// when the current period's brief already exists.
func startAssistantScheduler(db *sql.DB) {
	svc := assistant.NewService(db, assistant.ConfigFromEnv())
	if !svc.Enabled() {
		log.Printf("assistant: ASSISTANT_BASE_URL/ASSISTANT_MODEL unset — AI briefs disabled")
		return
	}
	gen := func(onlyMissing bool) {
		for _, kind := range []string{"day", "week"} {
			if onlyMissing && svc.HasCurrent(kind) {
				continue
			}
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			if _, err := svc.Generate(ctx, kind); err != nil {
				log.Printf("assistant: %s brief: %v", kind, err)
			} else {
				log.Printf("assistant: generated %s brief", kind)
			}
			cancel()
		}
	}
	go func() {
		gen(true)
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			gen(false)
		}
	}()
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
