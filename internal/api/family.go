package api

import (
	"encoding/json"
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
