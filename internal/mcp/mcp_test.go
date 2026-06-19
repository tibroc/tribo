package mcp_test

import (
	"context"
	"path/filepath"
	"testing"

	sdk "github.com/modelcontextprotocol/go-sdk/mcp"

	"tribo/internal/mcp"
	"tribo/internal/store"
)

// Connects an in-process MCP client to the server over an in-memory transport
// and exercises the done-criteria tools: check_availability and complete_chore.
func TestMCPTools(t *testing.T) {
	t.Setenv("TRIBO_SEED", "true") // this test exercises tools against the example data
	db, err := store.Open(filepath.Join(t.TempDir(), "mcp.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	ctx := context.Background()
	server := mcp.NewServer(db)
	clientT, serverT := sdk.NewInMemoryTransports()
	if _, err := server.Connect(ctx, serverT, nil); err != nil {
		t.Fatalf("server connect: %v", err)
	}
	client := sdk.NewClient(&sdk.Implementation{Name: "test", Version: "0"}, nil)
	session, err := client.Connect(ctx, clientT, nil)
	if err != nil {
		t.Fatalf("client connect: %v", err)
	}
	defer session.Close()

	// check_availability over a weekday work hour — guardians should be busy.
	res, err := session.CallTool(ctx, &sdk.CallToolParams{
		Name:      "check_availability",
		Arguments: map[string]any{"from": "2026-06-10T10:00:00+01:00", "to": "2026-06-10T11:00:00+01:00"},
	})
	if err != nil {
		t.Fatalf("check_availability: %v", err)
	}
	if res.IsError {
		t.Fatalf("check_availability returned error: %+v", res.Content)
	}

	// complete_chore on a pending instance.
	var instanceID string
	if err := db.QueryRow(`SELECT id FROM chore_instance WHERE status = 'pending' ORDER BY period_start LIMIT 1`).Scan(&instanceID); err != nil {
		t.Fatalf("find pending instance: %v", err)
	}
	res, err = session.CallTool(ctx, &sdk.CallToolParams{
		Name:      "complete_chore",
		Arguments: map[string]any{"instanceId": instanceID},
	})
	if err != nil {
		t.Fatalf("complete_chore: %v", err)
	}
	if res.IsError {
		t.Fatalf("complete_chore returned error: %+v", res.Content)
	}

	// Verify it persisted.
	var status string
	if err := db.QueryRow(`SELECT status FROM chore_instance WHERE id = ?`, instanceID).Scan(&status); err != nil {
		t.Fatalf("read status: %v", err)
	}
	if status != "done" {
		t.Fatalf("want status done, got %q", status)
	}
}
