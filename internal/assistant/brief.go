package assistant

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Brief is the structured output rendered by the Home card (mockup option B).
type Brief struct {
	Kind        string     `json:"kind"` // day | week
	PeriodStart string     `json:"periodStart"`
	GeneratedAt string     `json:"generatedAt"`
	Model       string     `json:"model"`
	Priorities  []Priority `json:"priorities"`
	WatchOut    string     `json:"watchOut,omitempty"`
	Praise      string     `json:"praise,omitempty"`
}

type Priority struct {
	Title           string `json:"title"`
	Why             string `json:"why,omitempty"`
	MemberID        string `json:"memberId,omitempty"`
	ChoreInstanceID string `json:"choreInstanceId,omitempty"`
	EventID         string `json:"eventId,omitempty"`
	TodoID          string `json:"todoId,omitempty"`
	// EventStartAt is filled server-side from the snapshot (never by the model)
	// so the UI can deep-link to the event's week.
	EventStartAt string `json:"eventStartAt,omitempty"`
}

// llmBrief is what we ask the model to emit; ids must come from the context.
type llmBrief struct {
	Priorities []Priority `json:"priorities"`
	WatchOut   string     `json:"watchOut"`
	Praise     string     `json:"praise"`
}

var ErrDisabled = errors.New("assistant not configured")
var ErrNoBrief = errors.New("no brief generated yet")
var ErrRateLimited = errors.New("brief was just refreshed — try again in a minute")

const systemPrompt = `You are the planning assistant inside Tribo, a self-hosted family organizer. You receive a JSON snapshot of the family's real calendar events, chores, to-dos, and guardians' work hours for a period, and you produce a short prioritized brief.

Rules:
- Respond with ONLY a JSON object, no prose, no markdown fences.
- Schema: {"priorities":[{"title":"...","why":"...","memberId":"...","choreInstanceId":"...","eventId":"...","todoId":"..."}],"watchOut":"...","praise":"..."}
- 2 to 5 priorities, most urgent first. Each is a concrete action for today/this period.
- Every id (memberId, choreInstanceId, eventId, todoId) MUST be copied verbatim from the snapshot; omit id fields that don't apply. Never invent items or ids.
- Events with needsGuardian=true are the most urgent kind of priority: someone must claim them.
- "why" is one short clause (max ~8 words) explaining the urgency.
- "watchOut" (optional, may be empty ""): one sentence about an upcoming clash or risk visible in the data (e.g. an event during both guardians' work hours).
- "praise" (optional, may be empty ""): one encouraging sentence grounded in lastWeek's numbers. Skip it if the numbers are weak.
- Keep titles short and family-friendly. No emoji.`

// Generate builds the grounding context, calls the LLM, validates the result
// against the context (grounding guard), stores it, and returns it.
func (s *Service) Generate(ctx context.Context, kind string) (*Brief, error) {
	if !s.Enabled() {
		return nil, ErrDisabled
	}
	if kind != "day" && kind != "week" {
		return nil, fmt.Errorf("kind must be day or week")
	}
	now := time.Now().In(s.familyLocation())

	bctx, err := s.buildContext(kind, now)
	if err != nil {
		return nil, err
	}

	user := fmt.Sprintf("Write the %s brief in language %q for this snapshot:\n%s", kind, s.cfg.Language, bctx.json())
	raw, err := s.complete(ctx, systemPrompt, user)
	if err != nil {
		return nil, err
	}

	parsed, err := parseLLMBrief(raw)
	if err != nil {
		return nil, fmt.Errorf("assistant returned unparseable brief: %w", err)
	}
	groundBrief(parsed, bctx)
	if len(parsed.Priorities) == 0 {
		return nil, errors.New("assistant returned no usable priorities")
	}

	brief := &Brief{
		Kind:        kind,
		PeriodStart: periodStart(kind, now),
		GeneratedAt: now.Format(time.RFC3339),
		Model:       s.cfg.Model,
		Priorities:  parsed.Priorities,
		WatchOut:    strings.TrimSpace(parsed.WatchOut),
		Praise:      strings.TrimSpace(parsed.Praise),
	}
	if err := s.store(brief); err != nil {
		return nil, err
	}
	return brief, nil
}

// Refresh is the rate-limited on-demand variant used by the UI button.
func (s *Service) Refresh(ctx context.Context, kind string) (*Brief, error) {
	s.mu.Lock()
	last := s.lastRefresh[kind]
	if time.Since(last) < time.Minute {
		s.mu.Unlock()
		return nil, ErrRateLimited
	}
	s.lastRefresh[kind] = time.Now()
	s.mu.Unlock()
	return s.Generate(ctx, kind)
}

// Latest returns the cached brief for the current period, or ErrNoBrief.
func (s *Service) Latest(kind string) (*Brief, error) {
	if !s.Enabled() {
		return nil, ErrDisabled
	}
	if kind != "day" && kind != "week" {
		return nil, fmt.Errorf("kind must be day or week")
	}
	now := time.Now().In(s.familyLocation())
	var content string
	err := s.db.QueryRow(
		`SELECT content_json FROM assistant_brief WHERE kind = ? AND period_start = ?`,
		kind, periodStart(kind, now)).Scan(&content)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNoBrief
	}
	if err != nil {
		return nil, err
	}
	var b Brief
	if err := json.Unmarshal([]byte(content), &b); err != nil {
		return nil, err
	}
	return &b, nil
}

// HasCurrent reports whether a brief already exists for the current period
// (used by the scheduler to skip redundant LLM calls on restart).
func (s *Service) HasCurrent(kind string) bool {
	now := time.Now().In(s.familyLocation())
	var one int
	err := s.db.QueryRow(`SELECT 1 FROM assistant_brief WHERE kind = ? AND period_start = ?`,
		kind, periodStart(kind, now)).Scan(&one)
	return err == nil
}

func (s *Service) store(b *Brief) error {
	content, err := json.Marshal(b)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(
		`INSERT INTO assistant_brief (id, kind, period_start, content_json, model, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT (kind, period_start) DO UPDATE SET
		   content_json = excluded.content_json, model = excluded.model, created_at = excluded.created_at`,
		uuid.NewString(), b.Kind, b.PeriodStart, string(content), b.Model, b.GeneratedAt)
	return err
}

// parseLLMBrief extracts the JSON object from the model output, tolerating
// markdown fences and stray prose around it.
func parseLLMBrief(raw string) (*llmBrief, error) {
	trimmed := strings.TrimSpace(raw)
	start := strings.Index(trimmed, "{")
	end := strings.LastIndex(trimmed, "}")
	if start < 0 || end <= start {
		return nil, fmt.Errorf("no JSON object in output")
	}
	var out llmBrief
	if err := json.Unmarshal([]byte(trimmed[start:end+1]), &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// groundBrief drops hallucinated references: any id not present in the
// snapshot is cleared (priority kept as informational), and priorities are
// capped at 5.
func groundBrief(b *llmBrief, c *briefContext) {
	members := map[string]bool{}
	for _, m := range c.Members {
		members[m.ID] = true
	}
	eventStart := map[string]string{}
	for _, e := range c.Events {
		eventStart[e.ID] = e.Start
	}
	choreInstances := map[string]bool{}
	for _, ch := range c.Chores {
		choreInstances[ch.InstanceID] = true
	}
	todoIDs := map[string]bool{}
	for _, t := range c.OpenTodos {
		todoIDs[t.ID] = true
	}

	kept := b.Priorities[:0]
	for _, p := range b.Priorities {
		if strings.TrimSpace(p.Title) == "" {
			continue
		}
		if !members[p.MemberID] {
			p.MemberID = ""
		}
		if start, ok := eventStart[p.EventID]; ok {
			p.EventStartAt = start
		} else {
			p.EventID, p.EventStartAt = "", ""
		}
		if !choreInstances[p.ChoreInstanceID] {
			p.ChoreInstanceID = ""
		}
		if !todoIDs[p.TodoID] {
			p.TodoID = ""
		}
		kept = append(kept, p)
		if len(kept) == 5 {
			break
		}
	}
	b.Priorities = kept
}
