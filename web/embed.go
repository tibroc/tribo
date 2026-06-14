// Package web embeds the built React frontend so the Go binary can serve it
// directly (no separate static file server). The dist/ directory is produced by
// the frontend build during the Docker image build.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// FS returns the embedded production build rooted at dist/, or nil if the build
// hasn't been generated yet (placeholder only) — callers serve API-only then.
func FS() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		return nil
	}
	// If dist holds only the placeholder, there's no index.html to serve.
	if _, err := fs.Stat(sub, "index.html"); err != nil {
		return nil
	}
	return sub
}
