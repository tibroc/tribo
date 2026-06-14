package api

import "net/http"

// GET /api/family-members
func (s *Server) listFamilyMembers(w http.ResponseWriter, r *http.Request) {
	members, err := s.family.ListMembers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, members)
}
