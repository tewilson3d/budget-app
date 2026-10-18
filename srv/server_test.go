package srv

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const (
	memberA   = "a@example.com"
	memberB   = "b@example.com"
	outsider  = "eve@example.com"
	indexHTML = "<!doctype html><title>Budget</title>"
)

// newTestServer returns a server with its own database and a small dist/,
// shared by the two members above.
func newTestServer(t *testing.T) *Server {
	t.Helper()
	dir := t.TempDir()
	dist := filepath.Join(dir, "dist")
	if err := os.MkdirAll(filepath.Join(dist, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	for name, body := range map[string]string{
		"index.html":           indexHTML,
		"assets/app-1.js":      "console.log(1)",
		"sw.js":                "self.x = 1",
		"manifest.webmanifest": "{}",
	} {
		if err := os.WriteFile(filepath.Join(dist, filepath.FromSlash(name)), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	s, err := New(filepath.Join(dir, "test.sqlite3"), dist, []string{memberA, " B@Example.com "}, "")
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	t.Cleanup(func() { s.DB.Close() })
	return s
}

// do sends one request through the full handler as the given exe.dev user
// ("" means not logged in) and returns the status and body.
func do(t *testing.T, h http.Handler, method, path, email, body string) (int, string, http.Header) {
	t.Helper()
	return doAuth(t, h, method, path, email, "", body)
}

func doAuth(t *testing.T, h http.Handler, method, path, email, appKey, body string) (int, string, http.Header) {
	t.Helper()
	var rd io.Reader
	if body != "" {
		rd = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, path, rd)
	if email != "" {
		req.Header.Set("X-ExeDev-Email", email)
	}
	if appKey != "" {
		req.Header.Set("X-Budget-Key", appKey)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec.Code, rec.Body.String(), rec.Header()
}

func TestNew(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()

	if _, err := New(filepath.Join(dir, "none.sqlite3"), dir, []string{"", " "}, ""); err == nil {
		t.Error("New with no members: want error, got nil")
	}

	s, err := New(filepath.Join(dir, "ok.sqlite3"), dir, []string{" Kim@Example.COM ", ""}, "Dev@Local")
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	defer s.DB.Close()
	for _, want := range []string{"kim@example.com", "dev@local"} {
		if !s.Members[want] {
			t.Errorf("Members missing %q: %v", want, s.Members)
		}
	}
	if len(s.Members) != 2 {
		t.Errorf("Members = %v, want exactly 2", s.Members)
	}
}

func TestServer_requireMember(t *testing.T) {
	t.Parallel()
	h := newTestServer(t).Handler()

	tests := []struct {
		name         string
		path         string
		email        string
		wantStatus   int
		wantLocation string
	}{
		{name: "api without login is 401", path: "/api/state", wantStatus: http.StatusUnauthorized},
		{name: "page without login serves standalone shell", path: "/history?x=1", wantStatus: http.StatusOK},
		{name: "api for non-member is 403", path: "/api/state", email: outsider, wantStatus: http.StatusForbidden},
		{name: "page for non-member still serves standalone shell", path: "/", email: outsider, wantStatus: http.StatusOK},
		{name: "member gets api", path: "/api/state", email: memberA, wantStatus: http.StatusOK},
		{name: "member email is case-insensitive", path: "/api/state", email: "  A@EXAMPLE.com", wantStatus: http.StatusOK},
		{name: "second member gets page", path: "/", email: memberB, wantStatus: http.StatusOK},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			status, _, hdr := do(t, h, http.MethodGet, tt.path, tt.email, "")
			if status != tt.wantStatus {
				t.Errorf("status = %d, want %d", status, tt.wantStatus)
			}
			if got := hdr.Get("Location"); got != tt.wantLocation {
				t.Errorf("Location = %q, want %q", got, tt.wantLocation)
			}
		})
	}
}

func TestServer_requireMember_devUser(t *testing.T) {
	t.Parallel()
	s := newTestServer(t)
	s.DevUser = "dev@local"
	s.Members["dev@local"] = true

	status, body, _ := do(t, s.Handler(), http.MethodGet, "/api/state", "", "")
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%s)", status, body)
	}
	var state struct{ Member string }
	if err := json.Unmarshal([]byte(body), &state); err != nil {
		t.Fatal(err)
	}
	if state.Member != "dev@local" {
		t.Errorf("member = %q, want dev@local", state.Member)
	}
}

func TestServer_handleApp(t *testing.T) {
	t.Parallel()
	h := newTestServer(t).Handler()

	tests := []struct {
		name      string
		path      string
		wantBody  string
		wantCache string
	}{
		{name: "root serves the shell", path: "/", wantBody: indexHTML, wantCache: "no-cache"},
		{name: "unknown route falls back to the shell", path: "/month/2026-10", wantBody: indexHTML, wantCache: "no-cache"},
		{name: "hashed asset is cached for good", path: "/assets/app-1.js", wantBody: "console.log(1)", wantCache: "public, max-age=31536000, immutable"},
		{name: "service worker is always re-checked", path: "/sw.js", wantBody: "self.x = 1", wantCache: "no-cache"},
		{name: "manifest is always re-checked", path: "/manifest.webmanifest", wantBody: "{}", wantCache: "no-cache"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			status, body, hdr := do(t, h, http.MethodGet, tt.path, memberA, "")
			if status != http.StatusOK {
				t.Fatalf("status = %d, want 200", status)
			}
			if body != tt.wantBody {
				t.Errorf("body = %q, want %q", body, tt.wantBody)
			}
			if got := hdr.Get("Cache-Control"); got != tt.wantCache {
				t.Errorf("Cache-Control = %q, want %q", got, tt.wantCache)
			}
		})
	}
}

// The router already cleans "..", so call the file server directly to check
// it never leaves dist/ on its own: the database sits right beside dist/.
// Serving the shell or refusing the path are both fine.
func TestServer_handleApp_staysInDist(t *testing.T) {
	t.Parallel()
	s := newTestServer(t)
	for _, p := range []string{"/../test.sqlite3", "/assets/../../test.sqlite3"} {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.URL.Path = p
		rec := httptest.NewRecorder()
		s.handleApp(rec, req)
		if body := rec.Body.String(); strings.HasPrefix(body, "SQLite format") || (rec.Code == http.StatusOK && body != indexHTML) {
			t.Errorf("%s = %d %q, want the app shell or a refusal", p, rec.Code, body)
		}
	}
}

func TestServer_handleApp_rejectsWrites(t *testing.T) {
	t.Parallel()
	h := newTestServer(t).Handler()
	if status, _, _ := do(t, h, http.MethodPost, "/", memberA, "x"); status != http.StatusMethodNotAllowed {
		t.Errorf("POST / = %d, want 405", status)
	}
}

func TestServer_Handler_unknownAPI(t *testing.T) {
	t.Parallel()
	h := newTestServer(t).Handler()
	status, body, _ := do(t, h, http.MethodGet, "/api/nope", memberA, "")
	if status != http.StatusNotFound || !strings.Contains(body, "not found") {
		t.Errorf("GET /api/nope = %d %s, want 404 JSON (not the app shell)", status, body)
	}
}

func TestServer_standaloneAppKey(t *testing.T) {
	t.Parallel()
	s := newTestServer(t)
	s.AppKey = "test-standalone-key"

	status, body, _ := doAuth(t, s.Handler(), http.MethodGet, "/api/state", "", s.AppKey, "")
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200 (%s)", status, body)
	}
	var state struct{ Member string }
	if err := json.Unmarshal([]byte(body), &state); err != nil {
		t.Fatal(err)
	}
	if state.Member != "standalone-app" {
		t.Errorf("member = %q, want standalone-app", state.Member)
	}

	status, _, _ = doAuth(t, s.Handler(), http.MethodGet, "/api/state", "", "wrong-key", "")
	if status != http.StatusUnauthorized {
		t.Errorf("wrong key status = %d, want 401", status)
	}
}

func TestServer_refreshAppBypassesLoginAndRequiresKey(t *testing.T) {
	t.Parallel()
	s := newTestServer(t)
	s.AppKey = "refresh-test-key"
	h := s.Handler()

	status, _, _ := do(t, h, http.MethodGet, "/api/refresh-app?key=wrong", "", "")
	if status != http.StatusUnauthorized {
		t.Fatalf("wrong key status = %d, want 401", status)
	}
	status, body, headers := do(t, h, http.MethodGet, "/api/refresh-app?key="+s.AppKey, "", "")
	if status != http.StatusOK {
		t.Fatalf("correct key status = %d, want 200", status)
	}
	if !strings.Contains(body, "navigator.serviceWorker.getRegistrations") || !strings.Contains(body, s.AppKey) {
		t.Errorf("refresh page does not contain reset script")
	}
	if got := headers.Get("Cache-Control"); got != "no-store" {
		t.Errorf("Cache-Control = %q, want no-store", got)
	}
}
