package assistant

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"tribo/internal/store"
)

// testDB opens a migrated (unseeded) store and inserts a minimal family with
// one pending chore instance and one open todo.
func testDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "assistant.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	mustExec := func(q string, args ...any) {
		t.Helper()
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatalf("exec %q: %v", q, err)
		}
	}
	mustExec(`INSERT INTO family (id, name, timezone) VALUES ('fam', 'Test Family', 'UTC')`)
	mustExec(`INSERT INTO family_member (id, family_id, name, color, role) VALUES ('mem-a', 'fam', 'Alba', '#4F7E91', 'guardian')`)
	mustExec(`INSERT INTO chore (id, title, recurrence_rule, assignment_mode, assigned_member_id) VALUES ('ch-1', 'Water plants', 'weekly', 'fixed', 'mem-a')`)
	today := time.Now().UTC().Format("2006-01-02")
	mustExec(`INSERT INTO chore_instance (id, chore_id, period_start, period_end, assigned_member_id, status) VALUES ('inst-1', 'ch-1', ?, ?, 'mem-a', 'pending')`, today, today)
	mustExec(`INSERT INTO todo (id, title, status) VALUES ('todo-1', 'Buy a gift', 'open')`)
	return db
}

// fakeBackend is an OpenAI-compatible /chat/completions server returning a
// canned assistant message; the user prompt is captured into gotUser.
func fakeBackend(t *testing.T, reply string, gotUser *string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			http.Error(w, "wrong path: "+r.URL.Path, http.StatusNotFound)
			return
		}
		var req struct {
			Messages []struct{ Role, Content string } `json:"messages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		if gotUser != nil && len(req.Messages) > 1 {
			*gotUser = req.Messages[1].Content
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]any{"role": "assistant", "content": reply}}},
		})
	}))
}

func TestGenerateGroundsAndStores(t *testing.T) {
	db := testDB(t)

	// Model output wrapped in markdown fences, with one valid chore reference
	// and one priority carrying a hallucinated event id + unknown member.
	reply := "```json\n{\"priorities\":[{\"title\":\"Water the plants\",\"why\":\"due today\",\"memberId\":\"mem-a\",\"choreInstanceId\":\"inst-1\"},{\"title\":\"Fake thing\",\"memberId\":\"nobody\",\"eventId\":\"evt-made-up\"}],\"watchOut\":\"\",\"praise\":\"Nice week!\"}\n```"
	var gotUser string
	srv := fakeBackend(t, reply, &gotUser)
	defer srv.Close()

	svc := NewService(db, Config{BaseURL: srv.URL, Model: "test-model", Language: "en"})
	b, err := svc.Generate(context.Background(), "day")
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}

	if len(b.Priorities) != 2 {
		t.Fatalf("want 2 priorities, got %d", len(b.Priorities))
	}
	if b.Priorities[0].ChoreInstanceID != "inst-1" || b.Priorities[0].MemberID != "mem-a" {
		t.Errorf("valid ids should survive grounding: %+v", b.Priorities[0])
	}
	if b.Priorities[1].EventID != "" || b.Priorities[1].MemberID != "" {
		t.Errorf("hallucinated ids should be cleared: %+v", b.Priorities[1])
	}
	if b.Praise != "Nice week!" || b.Model != "test-model" {
		t.Errorf("unexpected brief fields: %+v", b)
	}
	for _, want := range []string{"inst-1", "todo-1", "Alba"} {
		if !strings.Contains(gotUser, want) {
			t.Errorf("grounding snapshot missing %q: %s", want, gotUser)
		}
	}

	// Cached copy is retrievable and flagged as current.
	got, err := svc.Latest("day")
	if err != nil {
		t.Fatalf("Latest: %v", err)
	}
	if got.Priorities[0].Title != "Water the plants" {
		t.Errorf("cached brief mismatch: %+v", got)
	}
	if !svc.HasCurrent("day") {
		t.Error("HasCurrent should be true after Generate")
	}
	if svc.HasCurrent("week") {
		t.Error("week brief was never generated")
	}
}

func TestRefreshRateLimit(t *testing.T) {
	db := testDB(t)
	srv := fakeBackend(t, `{"priorities":[{"title":"X"}],"watchOut":"","praise":""}`, nil)
	defer srv.Close()
	svc := NewService(db, Config{BaseURL: srv.URL, Model: "m", Language: "en"})

	if _, err := svc.Refresh(context.Background(), "day"); err != nil {
		t.Fatalf("first refresh: %v", err)
	}
	if _, err := svc.Refresh(context.Background(), "day"); err != ErrRateLimited {
		t.Fatalf("second refresh should be rate-limited, got %v", err)
	}
	// A different kind has its own limiter bucket.
	if _, err := svc.Refresh(context.Background(), "week"); err != nil {
		t.Fatalf("week refresh should not be limited by day: %v", err)
	}
}

func TestDisabledAndNoBrief(t *testing.T) {
	db := testDB(t)

	off := NewService(db, Config{})
	if off.Enabled() {
		t.Error("empty config should be disabled")
	}
	if _, err := off.Latest("day"); err != ErrDisabled {
		t.Errorf("want ErrDisabled, got %v", err)
	}

	on := NewService(db, Config{BaseURL: "http://localhost:1", Model: "m"})
	if _, err := on.Latest("day"); err != ErrNoBrief {
		t.Errorf("want ErrNoBrief, got %v", err)
	}
}

func TestGenerateRejectsEmptyPriorities(t *testing.T) {
	db := testDB(t)
	srv := fakeBackend(t, `{"priorities":[],"watchOut":"","praise":""}`, nil)
	defer srv.Close()
	svc := NewService(db, Config{BaseURL: srv.URL, Model: "m"})
	if _, err := svc.Generate(context.Background(), "day"); err == nil {
		t.Fatal("expected error for empty priorities")
	}
	if svc.HasCurrent("day") {
		t.Error("failed generation must not store a brief")
	}
}

func TestParseLLMBriefTolerance(t *testing.T) {
	good := []string{
		`{"priorities":[{"title":"a"}],"watchOut":"","praise":""}`,
		"Here you go:\n```json\n{\"priorities\":[{\"title\":\"a\"}]}\n```\nHope that helps!",
	}
	for _, c := range good {
		if _, err := parseLLMBrief(c); err != nil {
			t.Errorf("parseLLMBrief(%q): %v", c, err)
		}
	}
	if _, err := parseLLMBrief("no json here"); err == nil {
		t.Error("expected error for non-JSON output")
	}
}
