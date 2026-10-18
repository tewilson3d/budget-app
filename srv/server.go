package srv

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"srv.exe.dev/db"
)

// Server serves the PWA build (dist/) and the shared-budget API. Every member
// sees and edits the same pot; there is no per-user data.
type Server struct {
	DB      *sql.DB
	DistDir string
	// Members are the lower-cased emails allowed in. exe.dev's proxy puts the
	// logged-in user's email in X-ExeDev-Email; anyone else gets 403.
	Members map[string]bool
	// DevUser, when set, stands in for a request with no exe.dev login, so the
	// app can be run locally without the proxy. Never set it in production.
	DevUser string
	// AppKey authenticates installed standalone PWAs without relying on an
	// exe.dev browser session. It is stored only in the service environment.
	AppKey string
}

func New(dbPath, distDir string, members []string, devUser string) (*Server, error) {
	s := &Server{
		DistDir: distDir,
		Members: map[string]bool{},
		DevUser: strings.ToLower(strings.TrimSpace(devUser)),
		AppKey:  strings.TrimSpace(os.Getenv("BUDGET_APP_KEY")),
	}
	for _, m := range members {
		if m = strings.ToLower(strings.TrimSpace(m)); m != "" {
			s.Members[m] = true
		}
	}
	if s.DevUser != "" {
		s.Members[s.DevUser] = true
	}
	if len(s.Members) == 0 {
		return nil, fmt.Errorf("no members configured: set BUDGET_MEMBERS to a comma-separated list of emails")
	}
	if err := s.setUpDatabase(dbPath); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Server) setUpDatabase(dbPath string) error {
	wdb, err := db.Open(dbPath)
	if err != nil {
		return fmt.Errorf("failed to open db: %w", err)
	}
	s.DB = wdb
	if err := db.RunMigrations(wdb); err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}
	return nil
}

// ---- Auth ----

type ctxKey struct{}

// member returns the email of the member making the request. Only valid
// inside handlers wrapped by requireMember.
func member(r *http.Request) string {
	email, _ := r.Context().Value(ctxKey{}).(string)
	return email
}

func contextWithMember(r *http.Request, email string) context.Context {
	return context.WithValue(r.Context(), ctxKey{}, email)
}

// requireMember leaves the PWA shell public so an installed app never gets
// bounced into a browser login. Budget data remains private: API calls require
// either an allowed exe.dev identity or the standalone app key.
func (s *Server) requireMember(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}

		email := strings.ToLower(strings.TrimSpace(r.Header.Get("X-ExeDev-Email")))
		if email == "" {
			email = s.DevUser
		}
		if email != "" && s.Members[email] {
			next.ServeHTTP(w, r.WithContext(contextWithMember(r, email)))
			return
		}

		provided := r.Header.Get("X-Budget-Key")
		if s.AppKey != "" && len(provided) == len(s.AppKey) && subtle.ConstantTimeCompare([]byte(provided), []byte(s.AppKey)) == 1 {
			next.ServeHTTP(w, r.WithContext(contextWithMember(r, "standalone-app")))
			return
		}

		if email != "" {
			slog.Warn("refused non-member", "email", email, "path", r.URL.Path)
			writeJSONError(w, http.StatusForbidden, "this account is not a member of this budget")
			return
		}
		writeJSONError(w, http.StatusUnauthorized, "enter the app access key")
	})
}

// ---- Static PWA ----

// handleApp serves files from dist/, falling back to index.html so the
// single-page app loads at any path.
func (s *Server) handleApp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	clean := path.Clean("/" + r.URL.Path)
	file := filepath.Join(s.DistDir, filepath.FromSlash(clean))
	if info, err := os.Stat(file); err != nil || info.IsDir() {
		clean = "/index.html"
		file = filepath.Join(s.DistDir, "index.html")
	}
	// The shell and the service worker must be re-checked on every load so a
	// deploy reaches phones; hashed assets can be cached.
	switch {
	case clean == "/index.html", clean == "/sw.js", strings.HasPrefix(clean, "/workbox-"), strings.HasSuffix(clean, ".webmanifest"):
		w.Header().Set("Cache-Control", "no-cache")
	case strings.HasPrefix(clean, "/assets/"):
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}
	http.ServeFile(w, r, file)
}

// ---- JSON helpers ----

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Warn("encode json response", "error", err)
	}
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// ---- Serve ----

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/state", s.HandleState)
	mux.HandleFunc("PUT /api/entries/{id}", s.HandlePutEntry)
	mux.HandleFunc("DELETE /api/entries/{id}", s.HandleDeleteEntry)
	mux.HandleFunc("PUT /api/payments/{billID}/{month}", s.HandlePutPayment)
	mux.HandleFunc("DELETE /api/payments/{billID}/{month}", s.HandleDeletePayment)
	mux.HandleFunc("PUT /api/settings", s.HandlePutSettings)
	mux.HandleFunc("POST /api/import", s.HandleImport)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeJSONError(w, http.StatusNotFound, "not found")
	})
	mux.HandleFunc("/", s.handleApp)
	return s.requireMember(mux)
}

// Serve starts the HTTP server.
func (s *Server) Serve(addr string) error {
	slog.Info("starting server", "addr", addr, "dist", s.DistDir, "members", len(s.Members))
	hs := &http.Server{
		Addr:              addr,
		Handler:           s.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       time.Minute,
		IdleTimeout:       2 * time.Minute,
	}
	return hs.ListenAndServe()
}
