package api

import (
	"io/fs"
	"mime"
	"net/http"
	"strings"
)

func init() {
	// Go's mime package doesn't know .webmanifest; without this the manifest is
	// served as octet-stream and browsers reject it for PWA install.
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
}

// noCacheRevalidate names the generated PWA files that must always be
// revalidated so clients pick up new builds promptly. The hashed app-shell
// assets are content-addressed and can cache forever; these entrypoints can't.
var noCacheRevalidate = map[string]bool{
	"sw.js":                true,
	"registerSW.js":        true,
	"manifest.webmanifest": true,
}

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
		if noCacheRevalidate[clean] {
			w.Header().Set("Cache-Control", "no-cache")
		}
		fileServer.ServeHTTP(w, r)
	})
}
