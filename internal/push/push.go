// Package push delivers self-hosted Web Push notifications (docs/focus-plan.md,
// phase F3): a morning brief and calm leaving-time transition warnings.
// VAPID-based — no third-party service; keys come from env or are generated
// once and stored. Everything is per-member opt-in with quiet hours, and the
// send log dedupes across restarts.
package push

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/google/uuid"
)

type Service struct {
	db      *sql.DB
	public  string
	private string
	subject string

	// send is injectable for tests; the default speaks real Web Push.
	send func(sub *webpush.Subscription, payload []byte) (int, error)
}

// New builds the push service, loading or generating VAPID keys. It never
// hard-fails: on key errors push is disabled (Enabled() == false) and the
// rest of the app runs.
func New(db *sql.DB) *Service {
	s := &Service{
		db:      db,
		subject: getenv("VAPID_SUBJECT", "https://github.com/tibroc/tribo"),
	}
	s.send = s.webPush

	s.public, s.private = os.Getenv("VAPID_PUBLIC_KEY"), os.Getenv("VAPID_PRIVATE_KEY")
	if s.public == "" || s.private == "" {
		if err := s.loadOrGenerateKeys(); err != nil {
			log.Printf("push: VAPID keys unavailable — push disabled: %v", err)
			s.public, s.private = "", ""
		}
	}
	return s
}

func (s *Service) Enabled() bool   { return s.public != "" && s.private != "" }
func (s *Service) PublicKey() string { return s.public }

// loadOrGenerateKeys reads the stored keypair or mints one on first boot —
// zero-config push for self-hosters.
func (s *Service) loadOrGenerateKeys() error {
	var pub, priv string
	err := s.db.QueryRow(`SELECT value FROM app_setting WHERE key = 'vapid_public'`).Scan(&pub)
	if err == nil {
		if err := s.db.QueryRow(`SELECT value FROM app_setting WHERE key = 'vapid_private'`).Scan(&priv); err == nil {
			s.public, s.private = pub, priv
			return nil
		}
	}
	priv, pub, err = webpush.GenerateVAPIDKeys()
	if err != nil {
		return err
	}
	if _, err := s.db.Exec(
		`INSERT OR REPLACE INTO app_setting (key, value) VALUES ('vapid_public', ?), ('vapid_private', ?)`,
		pub, priv); err != nil {
		return err
	}
	s.public, s.private = pub, priv
	log.Printf("push: generated VAPID keys (stored in app_setting)")
	return nil
}

// ===== Subscriptions =====

type Subscription struct {
	MemberID string
	Endpoint string
	P256dh   string
	Auth     string
}

// Subscribe registers (or re-binds) a browser's push subscription to a member.
func (s *Service) Subscribe(memberID, endpoint, p256dh, auth string) error {
	if memberID == "" || endpoint == "" || p256dh == "" || auth == "" {
		return fmt.Errorf("memberId, endpoint and keys are required")
	}
	_, err := s.db.Exec(
		`INSERT INTO push_subscription (id, member_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT (endpoint) DO UPDATE SET member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth`,
		uuid.NewString(), memberID, endpoint, p256dh, auth, time.Now().Format(time.RFC3339))
	return err
}

func (s *Service) Unsubscribe(endpoint string) error {
	_, err := s.db.Exec(`DELETE FROM push_subscription WHERE endpoint = ?`, endpoint)
	return err
}

// HasSubscription reports whether this endpoint is registered (drives the
// settings toggle state on a device).
func (s *Service) HasSubscription(endpoint string) bool {
	var one int
	return s.db.QueryRow(`SELECT 1 FROM push_subscription WHERE endpoint = ?`, endpoint).Scan(&one) == nil
}

func (s *Service) subscriptionsFor(memberID string) ([]Subscription, error) {
	rows, err := s.db.Query(`SELECT member_id, endpoint, p256dh, auth FROM push_subscription WHERE member_id = ?`, memberID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Subscription
	for rows.Next() {
		var sub Subscription
		if err := rows.Scan(&sub.MemberID, &sub.Endpoint, &sub.P256dh, &sub.Auth); err != nil {
			return nil, err
		}
		out = append(out, sub)
	}
	return out, rows.Err()
}

// membersWithSubscriptions lists member ids that have at least one device.
func (s *Service) membersWithSubscriptions() ([]string, error) {
	rows, err := s.db.Query(`SELECT DISTINCT member_id FROM push_subscription`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// ===== Preferences =====

// Prefs are per-member. Defaults: brief + transitions on, second nudge off,
// quiet 21:00–07:00 — and chores never ping (there is deliberately no toggle
// to make them).
type Prefs struct {
	MorningBrief bool   `json:"morningBrief"`
	BriefHour    int    `json:"briefHour"`
	Transitions  bool   `json:"transitions"`
	SecondNudge  bool   `json:"secondNudge"`
	QuietStart   string `json:"quietStart"`
	QuietEnd     string `json:"quietEnd"`
	Lang         string `json:"lang"`
}

func defaultPrefs() Prefs {
	return Prefs{MorningBrief: true, BriefHour: 7, Transitions: true, SecondNudge: false, QuietStart: "21:00", QuietEnd: "07:00", Lang: "en"}
}

func (s *Service) GetPrefs(memberID string) Prefs {
	p := defaultPrefs()
	var brief, trans, nudge int
	err := s.db.QueryRow(
		`SELECT morning_brief, brief_hour, transitions, second_nudge, quiet_start, quiet_end, lang
		 FROM notification_pref WHERE member_id = ?`, memberID).
		Scan(&brief, &p.BriefHour, &trans, &nudge, &p.QuietStart, &p.QuietEnd, &p.Lang)
	if err != nil {
		return p
	}
	p.MorningBrief, p.Transitions, p.SecondNudge = brief != 0, trans != 0, nudge != 0
	return p
}

func (s *Service) SetPrefs(memberID string, p Prefs) error {
	if p.BriefHour < 0 || p.BriefHour > 23 {
		return fmt.Errorf("briefHour must be 0..23")
	}
	if !validClock(p.QuietStart) || !validClock(p.QuietEnd) {
		return fmt.Errorf("quiet hours must be HH:MM")
	}
	if p.Lang == "" {
		p.Lang = "en"
	}
	_, err := s.db.Exec(
		`INSERT INTO notification_pref (member_id, morning_brief, brief_hour, transitions, second_nudge, quiet_start, quiet_end, lang)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT (member_id) DO UPDATE SET morning_brief = excluded.morning_brief, brief_hour = excluded.brief_hour,
		   transitions = excluded.transitions, second_nudge = excluded.second_nudge,
		   quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end, lang = excluded.lang`,
		memberID, boolInt(p.MorningBrief), p.BriefHour, boolInt(p.Transitions), boolInt(p.SecondNudge), p.QuietStart, p.QuietEnd, p.Lang)
	return err
}

// ===== Delivery =====

type payload struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	Tag   string `json:"tag"`
}

// deliver sends one notification to every device of a member; dead endpoints
// (404/410 from the push service) are pruned.
func (s *Service) deliver(memberID string, pl payload) {
	subs, err := s.subscriptionsFor(memberID)
	if err != nil {
		log.Printf("push: list subscriptions: %v", err)
		return
	}
	body, _ := json.Marshal(pl)
	for _, sub := range subs {
		status, err := s.send(&webpush.Subscription{
			Endpoint: sub.Endpoint,
			Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
		}, body)
		if err != nil {
			log.Printf("push: send to %s: %v", truncate(sub.Endpoint, 40), err)
			continue
		}
		if status == 404 || status == 410 {
			_ = s.Unsubscribe(sub.Endpoint)
			log.Printf("push: pruned dead subscription %s", truncate(sub.Endpoint, 40))
		}
	}
}

func (s *Service) webPush(sub *webpush.Subscription, body []byte) (int, error) {
	resp, err := webpush.SendNotification(body, sub, &webpush.Options{
		Subscriber:      s.subject,
		VAPIDPublicKey:  s.public,
		VAPIDPrivateKey: s.private,
		TTL:             1800,
		Urgency:         webpush.UrgencyNormal,
	})
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
}

// markSent claims a dedupe key; false means it was already delivered.
func (s *Service) markSent(key string, now time.Time) bool {
	res, err := s.db.Exec(`INSERT OR IGNORE INTO push_sent (key, sent_at) VALUES (?, ?)`, key, now.Format(time.RFC3339))
	if err != nil {
		return false
	}
	n, _ := res.RowsAffected()
	return n == 1
}

func (s *Service) pruneSent(now time.Time) {
	_, _ = s.db.Exec(`DELETE FROM push_sent WHERE sent_at < ?`, now.AddDate(0, 0, -7).Format(time.RFC3339))
}

// ===== helpers =====

func validClock(v string) bool {
	_, err := time.Parse("15:04", v)
	return err == nil
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
