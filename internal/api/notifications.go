package api

import (
	"net/http"
	"time"
)

// Notification is one action-center item for the header bell. The list is
// derived live from current data (no storage): items disappear once resolved
// (e.g. a guardian is assigned), so the bell reflects what still needs action.
// The human-readable message is derived on the client from Type (so it's
// localized); the backend only sends the structured fields.
type Notification struct {
	ID       string `json:"id"`       // stable per source row, e.g. "guardian:<eventId>"
	Type     string `json:"type"`     // "needs_guardian" | "unclaimed"
	Severity string `json:"severity"` // "warning" | "info"
	Title    string `json:"title"`    // event title
	EventID  string `json:"eventId"`  // deep-link target
	StartAt  string `json:"startAt"`  // RFC3339, for display + sorting
	Section  string `json:"section"`  // navigation target ("calendar")
}

// notificationWindow is how far ahead we look for guardian-needed events.
const notificationWindow = 14 * 24 * time.Hour

// GET /api/notifications — outstanding items needing attention.
func (s *Server) listNotifications(w http.ResponseWriter, _ *http.Request) {
	now := time.Now()
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	alerts, err := s.events.GuardianAlerts(from, from.Add(notificationWindow))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	out := make([]Notification, 0, len(alerts))
	for _, a := range alerts {
		n := Notification{
			ID:      "guardian:" + a.EventID,
			Type:    a.Status,
			Title:   a.Title,
			EventID: a.EventID,
			StartAt: a.StartAt,
			Section: "calendar",
		}
		if a.Status == "needs_guardian" {
			n.Severity = "warning"
		} else {
			n.Severity = "info"
		}
		out = append(out, n)
	}
	writeJSON(w, http.StatusOK, out)
}
