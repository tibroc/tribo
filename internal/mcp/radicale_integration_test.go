package mcp_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"tribo/internal/calsync"
	"tribo/internal/mcp"
	"tribo/internal/store"
)

// Gated on RADICALE_URL: verifies an MCP-created event is written to the Radicale
// backend (not just the local cache). Run locally with RADICALE_URL/USER/PASSWORD
// set against a live Radicale.
func TestMCPAddEventPushesToRadicale(t *testing.T) {
	if os.Getenv("RADICALE_URL") == "" {
		t.Skip("RADICALE_URL unset — skipping live Radicale integration test")
	}
	t.Setenv("TRIBO_SEED", "true")
	db, err := store.Open(filepath.Join(t.TempDir(), "mcp-rad.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	eng := calsync.NewEngine(db)
	if err := eng.EnsureManagedCalendars(ctx); err != nil {
		t.Fatalf("provision: %v", err)
	}
	if err := eng.MigrateInternalToRadicale(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	server := mcp.NewServer(db, eng)
	clientT, serverT := sdk.NewInMemoryTransports()
	if _, err := server.Connect(ctx, serverT, nil); err != nil {
		t.Fatalf("server connect: %v", err)
	}
	client := sdk.NewClient(&sdk.Implementation{Name: "test", Version: "0"}, nil)
	sess, err := client.Connect(ctx, clientT, nil)
	if err != nil {
		t.Fatalf("client connect: %v", err)
	}
	defer sess.Close()

	res, err := sess.CallTool(ctx, &sdk.CallToolParams{
		Name: "add_event",
		Arguments: map[string]any{
			"title":       "MCP violin",
			"start":       "2026-06-23T17:00:00+02:00",
			"end":         "2026-06-23T18:00:00+02:00",
			"attendeeIds": []string{"mem-marie"},
		},
	})
	if err != nil || res.IsError {
		t.Fatalf("add_event: err=%v result=%+v", err, res.Content)
	}

	// external_id is set only after a successful PUT to a CalDAV source, and the
	// event must land on Marie's person calendar (single attendee).
	var externalID, sourceName string
	if err := db.QueryRow(
		`SELECT COALESCE(e.external_id, ''), cs.display_name
		 FROM event e JOIN calendar_source cs ON cs.id = e.calendar_source_id
		 WHERE e.title = 'MCP violin'`).Scan(&externalID, &sourceName); err != nil {
		t.Fatalf("find event: %v", err)
	}
	if externalID == "" {
		t.Error("event has no external_id — it was not pushed to Radicale")
	}
	if sourceName != "Marie" {
		t.Errorf("event landed on %q, want Marie's calendar", sourceName)
	}
}
