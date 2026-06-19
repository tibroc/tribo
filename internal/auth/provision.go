package auth

import (
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/google/uuid"
)

// Curated marker palette mirrored from frontend/src/lib/tokens.ts (MARKER_CURATED).
// Slots 0–3 use the curated colors; later slots fall back to the default pine.
var markerCurated = []string{"#4F7E91", "#BC6678", "#7D9A55", "#8B6F97"}

const defaultMarker = "#3E6259"

func markerColor(i int) string {
	if i >= 0 && i < len(markerCurated) {
		return markerCurated[i]
	}
	return defaultMarker
}

// provisionMember auto-creates a family member from the user's OIDC groups on
// first login. It returns the new member id, or "" when the user is in none of
// the configured guardian/child groups (caller then falls back to manual
// mapping). Errors are returned only for unexpected DB failures.
func (s *Service) provisionMember(idToken *oidc.IDToken) (string, error) {
	var raw map[string]any
	if err := idToken.Claims(&raw); err != nil {
		return "", err
	}
	groups := stringSlice(raw[s.groupsClaim])
	role := s.roleForGroups(groups)
	if role == "" {
		return "", nil // not in a configured group → manual claim
	}

	name := firstNonEmpty(
		str(raw["name"]),
		str(raw["preferred_username"]),
		emailLocalPart(str(raw["email"])),
		"Member",
	)

	return s.insertMember(idToken.Subject, name, role)
}

// insertMember creates (or returns an already-mapped) family member for the
// given subject/role, ensuring the family row exists. Split out from
// provisionMember so it can be tested without an OIDC token.
func (s *Service) insertMember(sub, name, role string) (string, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback()

	// A previous concurrent login may have already mapped this subject.
	var existing string
	if err := tx.QueryRow(`SELECT id FROM family_member WHERE oidc_subject = ?`, sub).Scan(&existing); err == nil {
		return existing, nil
	}

	// Ensure the single family row exists (member FK requires it).
	var familyID string
	if err := tx.QueryRow(`SELECT id FROM family LIMIT 1`).Scan(&familyID); err != nil {
		familyID = uuid.NewString()
		tz := envOr("TRIBO_TIMEZONE", "UTC")
		if _, err := tx.Exec(`INSERT INTO family (id, name, timezone) VALUES (?, ?, ?)`, familyID, "Our Family", tz); err != nil {
			return "", err
		}
	}

	var count int
	_ = tx.QueryRow(`SELECT COUNT(*) FROM family_member`).Scan(&count)

	memberID := uuid.NewString()
	if _, err := tx.Exec(
		`INSERT INTO family_member (id, family_id, name, color, role, oidc_subject, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		memberID, familyID, name, markerColor(count), role, sub, count); err != nil {
		return "", err
	}

	// Children get the first existing guardian as their default (best effort).
	if role == "child" {
		var guardianID string
		if err := tx.QueryRow(`SELECT id FROM family_member WHERE role = 'guardian' AND id != ? ORDER BY sort_order LIMIT 1`, memberID).Scan(&guardianID); err == nil {
			_, _ = tx.Exec(`UPDATE family_member SET default_guardian_id = ? WHERE id = ?`, guardianID, memberID)
		}
	}

	if err := tx.Commit(); err != nil {
		return "", err
	}
	return memberID, nil
}

// roleForGroups maps the user's groups to a member role. Guardian wins when a
// user is in both kinds of group.
func (s *Service) roleForGroups(groups []string) string {
	set := make(map[string]bool, len(groups))
	for _, g := range groups {
		set[strings.ToLower(strings.TrimSpace(g))] = true
	}
	for _, g := range s.guardianGroups {
		if set[g] {
			return "guardian"
		}
	}
	for _, g := range s.childGroups {
		if set[g] {
			return "child"
		}
	}
	return ""
}

// stringSlice coerces a JSON claim value (typically []any of strings, but
// sometimes a single string) into a []string.
func stringSlice(v any) []string {
	switch t := v.(type) {
	case []any:
		out := make([]string, 0, len(t))
		for _, e := range t {
			if s := str(e); s != "" {
				out = append(out, s)
			}
		}
		return out
	case []string:
		return t
	case string:
		if t != "" {
			return []string{t}
		}
	}
	return nil
}

func str(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func emailLocalPart(email string) string {
	if i := strings.IndexByte(email, '@'); i > 0 {
		return email[:i]
	}
	return ""
}
