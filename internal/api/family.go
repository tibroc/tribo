package api

import (
	"encoding/json"
	"log"
	"net/http"

	"tribo/internal/family"
)

// GET /api/family-members
func (s *Server) listFamilyMembers(w http.ResponseWriter, r *http.Request) {
	members, err := s.family.ListMembers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, members)
}

func (s *Server) createFamilyMember(w http.ResponseWriter, r *http.Request) {
	var in family.MemberInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	m, err := s.family.AddMember(in)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	// Provision the new member's Radicale calendar (idempotent; no-op if the
	// backend is unconfigured). Best-effort — don't fail member creation on it.
	if s.sync.RadicaleEnabled() {
		if err := s.sync.EnsureManagedCalendars(r.Context()); err != nil {
			log.Printf("calendar provisioning after member add: %v", err)
		}
	}
	writeJSON(w, http.StatusCreated, m)
}

func (s *Server) updateFamilyMember(w http.ResponseWriter, r *http.Request) {
	var in family.MemberInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	m, err := s.family.UpdateMember(r.PathValue("id"), in)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (s *Server) deleteFamilyMember(w http.ResponseWriter, r *http.Request) {
	if err := s.family.DeleteMember(r.PathValue("id")); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
