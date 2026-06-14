package api

import (
	"io/fs"
	"net/http"
	"strings"
)

// spaHandler serves static assets from webFS and falls back to index.html for
// any path that doesn't match a file (client-side routing).
func spaHandler(webFS fs.FS) http.Handler {
	fileServer := http.FileServer(http.FS(webFS))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := strings.TrimPrefix(r.URL.Path, "/")
		if clean == "" {
			clean = "index.html"
		}
		if _, err := fs.Stat(webFS, clean); err != nil {
			// Not a real file → serve the SPA entrypoint.
			r2 := r.Clone(r.Context())
			r2.URL.Path = "/"
			http.ServeFileFS(w, r2, webFS, "index.html")
			return
		}
		fileServer.ServeHTTP(w, r)
	})
}
