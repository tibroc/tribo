package assistant

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"tribo/internal/tools"
)

// seqBackend returns canned assistant messages in order, capturing each request.
func seqBackend(t *testing.T, replies []chatMessage, reqs *[]chatRequest) *httptest.Server {
	t.Helper()
	i := 0
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req chatRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		if reqs != nil {
			*reqs = append(*reqs, req)
		}
		if i >= len(replies) {
			http.Error(w, "no more replies", http.StatusInternalServerError)
			return
		}
		msg := replies[i]
		i++
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []map[string]any{{"message": msg}}})
	}))
}

func toolCallMsg(id, name, args string) chatMessage {
	var tc toolCall
	tc.ID = id
	tc.Type = "function"
	tc.Function.Name = name
	tc.Function.Arguments = args
	return chatMessage{Role: "assistant", ToolCalls: []toolCall{tc}}
}

func collectEvents(evs *[]ChatEvent) func(ChatEvent) {
	return func(e ChatEvent) { *evs = append(*evs, e) }
}

func TestChatToolLoop(t *testing.T) {
	db := testDB(t)
	deps := tools.New(db, nil)

	var reqs []chatRequest
	srv := seqBackend(t, []chatMessage{
		toolCallMsg("c1", "add_todo", `{"title":"Pick up cake","assignedMemberId":"mem-a"}`),
		{Role: "assistant", Content: "Done — added the to-do for Alba."},
	}, &reqs)
	defer srv.Close()

	svc := NewService(db, Config{BaseURL: srv.URL, Model: "m", Language: "en"})
	var evs []ChatEvent
	err := svc.Chat(context.Background(), deps, Profile{MemberID: "mem-a", Role: "guardian"},
		[]ChatMessage{{Role: "user", Content: "Add a cake pickup to-do for Alba"}}, collectEvents(&evs))
	if err != nil {
		t.Fatalf("Chat: %v", err)
	}

	// Trace: tool start, tool ok, final message.
	want := []struct{ typ, name, status string }{
		{"tool", "add_todo", "start"},
		{"tool", "add_todo", "ok"},
		{"message", "", ""},
	}
	if len(evs) != len(want) {
		t.Fatalf("want %d events, got %+v", len(want), evs)
	}
	for i, w := range want {
		if evs[i].Type != w.typ || evs[i].Name != w.name || evs[i].Status != w.status {
			t.Errorf("event %d: want %+v, got %+v", i, w, evs[i])
		}
	}
	if evs[2].Content != "Done — added the to-do for Alba." {
		t.Errorf("final message: %q", evs[2].Content)
	}

	// The todo was really created.
	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM todo WHERE title = 'Pick up cake' AND assigned_member_id = 'mem-a'`).Scan(&n); err != nil || n != 1 {
		t.Errorf("todo not created (n=%d, err=%v)", n, err)
	}

	// Round 2 carried the tool result back to the model.
	if len(reqs) != 2 {
		t.Fatalf("want 2 backend calls, got %d", len(reqs))
	}
	last := reqs[1].Messages[len(reqs[1].Messages)-1]
	if last.Role != "tool" || last.ToolCallID != "c1" {
		t.Errorf("tool result not sent back: %+v", last)
	}

	// System prompt grounds members and profile.
	sys := reqs[0].Messages[0]
	if sys.Role != "system" || !strings.Contains(sys.Content, "Alba") || !strings.Contains(sys.Content, "mem-a") {
		t.Errorf("system prompt missing grounding: %s", sys.Content)
	}
}

func TestChatChildGuardrails(t *testing.T) {
	db := testDB(t)
	// A second (child) member with their own chore instance, plus one owned by Alba.
	mustExec := func(q string, args ...any) {
		t.Helper()
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatalf("exec: %v", err)
		}
	}
	mustExec(`INSERT INTO family_member (id, family_id, name, color, role) VALUES ('mem-kid', 'fam', 'Kim', '#7D9A55', 'child')`)
	mustExec(`INSERT INTO chore_instance (id, chore_id, period_start, period_end, assigned_member_id, status)
	          VALUES ('inst-kid', 'ch-1', '2026-01-01', '2026-01-01', 'mem-kid', 'pending')`)

	kid := Profile{MemberID: "mem-kid", Role: "child"}

	// 1) Write tools are absent from a child's tool list.
	for _, d := range toolDefsFor(kid) {
		if d.Function.Name == "add_event" || d.Function.Name == "add_todo" {
			t.Errorf("child tool list must not include %s", d.Function.Name)
		}
	}
	if n := len(toolDefsFor(Profile{Role: "guardian"})); n != len(chatTools) {
		t.Errorf("guardian should see all %d tools, got %d", len(chatTools), n)
	}

	deps := tools.New(db, nil)
	var reqs []chatRequest

	// 2) Even a forced add_todo call is rejected, and completing someone
	// else's chore fails while completing their own succeeds.
	srv := seqBackend(t, []chatMessage{
		toolCallMsg("c1", "add_todo", `{"title":"sneaky"}`),
		toolCallMsg("c2", "complete_chore", `{"instanceId":"inst-1"}`),  // Alba's
		toolCallMsg("c3", "complete_chore", `{"instanceId":"inst-kid"}`), // own
		{Role: "assistant", Content: "Your chore is done!"},
	}, &reqs)
	defer srv.Close()

	svc := NewService(db, Config{BaseURL: srv.URL, Model: "m", Language: "en"})
	var evs []ChatEvent
	if err := svc.Chat(context.Background(), deps, kid,
		[]ChatMessage{{Role: "user", Content: "mark my chore done"}}, collectEvents(&evs)); err != nil {
		t.Fatalf("Chat: %v", err)
	}

	statusOf := func(name string) []string {
		var out []string
		for _, e := range evs {
			if e.Type == "tool" && e.Name == name && e.Status != "start" {
				out = append(out, e.Status)
			}
		}
		return out
	}
	if got := statusOf("add_todo"); len(got) != 1 || got[0] != "error" {
		t.Errorf("add_todo by child should error, got %v", got)
	}
	if got := statusOf("complete_chore"); len(got) != 2 || got[0] != "error" || got[1] != "ok" {
		t.Errorf("complete_chore: want [error ok] (other's, own), got %v", got)
	}

	// Alba's chore untouched; the kid's chore done and credited to the kid.
	var status, completedBy string
	_ = db.QueryRow(`SELECT status FROM chore_instance WHERE id = 'inst-1'`).Scan(&status)
	if status != "pending" {
		t.Errorf("other member's chore must stay pending, got %s", status)
	}
	_ = db.QueryRow(`SELECT status, COALESCE(completed_by,'') FROM chore_instance WHERE id = 'inst-kid'`).Scan(&status, &completedBy)
	if status != "done" || completedBy != "mem-kid" {
		t.Errorf("own chore: want done by mem-kid, got %s by %s", status, completedBy)
	}
}

func TestChatDisabled(t *testing.T) {
	db := testDB(t)
	svc := NewService(db, Config{})
	err := svc.Chat(context.Background(), tools.New(db, nil), Profile{}, []ChatMessage{{Role: "user", Content: "hi"}}, func(ChatEvent) {})
	if err != ErrDisabled {
		t.Fatalf("want ErrDisabled, got %v", err)
	}
}

