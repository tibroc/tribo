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
		syncEngine.Start(context.Background())
	} else {
		log.Printf("calendars: RADICALE_URL unset — calendar backend disabled")
	}

	// Generates chore instances on a schedule and (when calendars are on) projects
	// them onto the Chores calendar.
	startChoreScheduler(db, syncEngine)

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

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
