// Package assistant generates AI briefs (daily/weekly priorities, watch-outs,
// praise) grounded in the family's real calendar/chore/todo data. It talks to
// any OpenAI-compatible chat-completions backend (Anthropic, Gemini, Ollama,
// vLLM, ...) configured via env; unconfigured means the feature is disabled
// and hidden. See docs/assistant-plan.md.
package assistant

import (
	"database/sql"
	"net/http"
	"os"
	"sync"
	"time"
)

// Config is read from env once at startup. BaseURL is the OpenAI-compatible
// API root (e.g. http://localhost:11434/v1); APIKey may be empty for local
// backends; Language is the BCP-47-ish language the brief text is written in.
type Config struct {
	BaseURL  string
	APIKey   string
	Model    string
	Language string
}

func ConfigFromEnv() Config {
	lang := os.Getenv("ASSISTANT_LANGUAGE")
	if lang == "" {
		lang = "en"
	}
	return Config{
		BaseURL:  os.Getenv("ASSISTANT_BASE_URL"),
		APIKey:   os.Getenv("ASSISTANT_API_KEY"),
		Model:    os.Getenv("ASSISTANT_MODEL"),
		Language: lang,
	}
}

type Service struct {
	db   *sql.DB
	cfg  Config
	http *http.Client

	mu          sync.Mutex
	lastRefresh map[string]time.Time // kind -> last on-demand generation
}

func NewService(db *sql.DB, cfg Config) *Service {
	return &Service{
		db:          db,
		cfg:         cfg,
		http:        &http.Client{Timeout: 90 * time.Second},
		lastRefresh: map[string]time.Time{},
	}
}

// Enabled reports whether an LLM backend is configured. When false every
// endpoint returns "disabled" and the frontend hides the feature entirely.
func (s *Service) Enabled() bool { return s.cfg.BaseURL != "" && s.cfg.Model != "" }

func (s *Service) Model() string { return s.cfg.Model }

// familyLocation mirrors calsync: brief periods follow the family's wall
// clock, not the server's.
func (s *Service) familyLocation() *time.Location {
	var tz string
	_ = s.db.QueryRow(`SELECT COALESCE(timezone, '') FROM family LIMIT 1`).Scan(&tz)
	if tz != "" {
		if loc, err := time.LoadLocation(tz); err == nil {
			return loc
		}
	}
	return time.Local
}

// periodStart is the cache key date for a brief kind: the day itself, or the
// week's Monday.
func periodStart(kind string, now time.Time) string {
	if kind == "week" {
		monday := now.AddDate(0, 0, -((int(now.Weekday()) + 6) % 7))
		return monday.Format("2006-01-02")
	}
	return now.Format("2006-01-02")
}
