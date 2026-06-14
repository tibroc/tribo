// Command tribo is the single binary: REST API + embedded React frontend.
// (MCP server, sync engine, and scheduler arrive in later milestones.)
package main

import (
	"log"
	"net/http"
	"os"

	"tribo/internal/api"
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

	handler := api.NewHandler(db, web.FS())

	log.Printf("tribo listening on %s (db: %s)", addr, dbPath)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatalf("server: %v", err)
	}
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
