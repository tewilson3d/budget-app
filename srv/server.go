package srv

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"html/template"
	"log/slog"
	"net/http"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"time"

	"srv.exe.dev/db"
	"srv.exe.dev/db/dbgen"
)

// Categories is the predefined list of transaction categories offered by the UI.
var Categories = []string{
	"Income",
	"Food",
	"Transport",
	"Housing",
	"Utilities",
	"Entertainment",
	"Shopping",
	"Health",
	"Education",
	"Other",
}

type Server struct {
	DB           *sql.DB
	Hostname     string
	TemplatesDir string
	StaticDir    string
}

type pageData struct {
	Hostname   string
	Categories []string
}

func New(dbPath, hostname string) (*Server, error) {
	_, thisFile, _, _ := runtime.Caller(0)
	baseDir := filepath.Dir(thisFile)
	srv := &Server{
		Hostname:     hostname,
		TemplatesDir: filepath.Join(baseDir, "templates"),
		StaticDir:    filepath.Join(baseDir, "static"),
	}
	if err := srv.setUpDatabase(dbPath); err != nil {
		return nil, err
	}
	return srv, nil
}

// HandleRoot renders the main single-page app shell.
func (s *Server) HandleRoot(w http.ResponseWriter, r *http.Request) {
	data := pageData{
		Hostname:   s.Hostname,
		Categories: Categories,
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if err := s.renderTemplate(w, "index.html", data); err != nil {
		slog.Warn("render template", "url", r.URL.Path, "error", err)
	}
}

func (s *Server) renderTemplate(w http.ResponseWriter, name string, data any) error {
	path := filepath.Join(s.TemplatesDir, name)
	tmpl, err := template.ParseFiles(path)
	if err != nil {
		return fmt.Errorf("parse template %q: %w", name, err)
	}
	if err := tmpl.Execute(w, data); err != nil {
		return fmt.Errorf("execute template %q: %w", name, err)
	}
	return nil
}

// ---- Auth helpers ----

// userIDFromRequest extracts the exe.dev proxy-injected user id header.
func userIDFromRequest(r *http.Request) string {
	return strings.TrimSpace(r.Header.Get("X-ExeDev-UserID"))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
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

// requireUser returns the authenticated user id, or writes a 401 response and
// returns ok=false if the request is unauthenticated.
func requireUser(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID := userIDFromRequest(r)
	if userID == "" {
		writeJSONError(w, http.StatusUnauthorized, "authentication required")
		return "", false
	}
	return userID, true
}

// ---- Month helpers ----

// monthFromRequest returns the YYYY-MM month string from the "month" query
// parameter, defaulting to the current month if absent or invalid.
func monthFromRequest(r *http.Request) string {
	month := strings.TrimSpace(r.URL.Query().Get("month"))
	if isValidMonth(month) {
		return month
	}
	return time.Now().Format("2006-01")
}

func isValidMonth(month string) bool {
	if len(month) != 7 {
		return false
	}
	_, err := time.Parse("2006-01", month)
	return err == nil
}

// ---- API types ----

type transactionResponse struct {
	ID          int64   `json:"id"`
	Amount      float64 `json:"amount"`
	Category    string  `json:"category"`
	Description string  `json:"description"`
	Date        string  `json:"date"`
	CreatedAt   string  `json:"created_at"`
}

func toTransactionResponse(t dbgen.Transaction) transactionResponse {
	desc := ""
	if t.Description != nil {
		desc = *t.Description
	}
	return transactionResponse{
		ID:          t.ID,
		Amount:      t.Amount,
		Category:    t.Category,
		Description: desc,
		Date:        t.Date,
		CreatedAt:   t.CreatedAt.Format(time.RFC3339),
	}
}

type createTransactionRequest struct {
	Amount      float64 `json:"amount"`
	Category    string  `json:"category"`
	Description string  `json:"description"`
	Date        string  `json:"date"`
}

type summaryResponse struct {
	Month          string                     `json:"month"`
	TotalIncome    float64                    `json:"total_income"`
	TotalExpenses  float64                    `json:"total_expenses"`
	Balance        float64                    `json:"balance"`
	ByCategory     []categoryBreakdownEntry   `json:"by_category"`
}

type categoryBreakdownEntry struct {
	Category string  `json:"category"`
	Total    float64 `json:"total"`
}

// ---- API handlers ----

// HandleListTransactions handles GET /api/transactions?month=YYYY-MM
func (s *Server) HandleListTransactions(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	month := monthFromRequest(r)

	q := dbgen.New(s.DB)
	rows, err := q.TransactionsForMonth(r.Context(), dbgen.TransactionsForMonthParams{
		UserID: userID,
		Date:   month,
	})
	if err != nil {
		slog.Error("list transactions", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to list transactions")
		return
	}

	result := make([]transactionResponse, 0, len(rows))
	for _, t := range rows {
		result = append(result, toTransactionResponse(t))
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"month":        month,
		"transactions": result,
	})
}

// HandleCreateTransaction handles POST /api/transactions
func (s *Server) HandleCreateTransaction(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	var req createTransactionRequest
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Category = strings.TrimSpace(req.Category)
	req.Date = strings.TrimSpace(req.Date)
	req.Description = strings.TrimSpace(req.Description)

	if req.Category == "" {
		writeJSONError(w, http.StatusBadRequest, "category is required")
		return
	}
	if req.Amount == 0 {
		writeJSONError(w, http.StatusBadRequest, "amount must be non-zero")
		return
	}
	if _, err := time.Parse("2006-01-02", req.Date); err != nil {
		writeJSONError(w, http.StatusBadRequest, "date must be in YYYY-MM-DD format")
		return
	}

	q := dbgen.New(s.DB)
	var descPtr *string
	if req.Description != "" {
		descPtr = &req.Description
	}

	txn, err := q.CreateTransaction(r.Context(), dbgen.CreateTransactionParams{
		UserID:      userID,
		Amount:      req.Amount,
		Category:    req.Category,
		Description: descPtr,
		Date:        req.Date,
		CreatedAt:   time.Now(),
	})
	if err != nil {
		slog.Error("create transaction", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to create transaction")
		return
	}

	writeJSON(w, http.StatusCreated, toTransactionResponse(txn))
}

// HandleDeleteTransaction handles DELETE /api/transactions/{id}
func (s *Server) HandleDeleteTransaction(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid transaction id")
		return
	}

	q := dbgen.New(s.DB)
	rowsAffected, err := q.DeleteTransaction(r.Context(), dbgen.DeleteTransactionParams{
		ID:     id,
		UserID: userID,
	})
	if err != nil {
		slog.Error("delete transaction", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to delete transaction")
		return
	}
	if rowsAffected == 0 {
		writeJSONError(w, http.StatusNotFound, "transaction not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// HandleSummary handles GET /api/summary?month=YYYY-MM
func (s *Server) HandleSummary(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	month := monthFromRequest(r)

	q := dbgen.New(s.DB)
	rows, err := q.SummaryForMonth(r.Context(), dbgen.SummaryForMonthParams{
		UserID: userID,
		Date:   month,
	})
	if err != nil {
		slog.Error("summary for month", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to compute summary")
		return
	}

	var totalIncome, totalExpenses float64
	byCategory := make([]categoryBreakdownEntry, 0, len(rows))
	for _, row := range rows {
		var total float64
		if row.Total != nil {
			total = *row.Total
		}
		if total > 0 {
			totalIncome += total
		} else {
			totalExpenses += -total
		}
		byCategory = append(byCategory, categoryBreakdownEntry{
			Category: row.Category,
			Total:    total,
		})
	}

	sort.Slice(byCategory, func(i, j int) bool {
		return byCategory[i].Total < byCategory[j].Total
	})

	resp := summaryResponse{
		Month:         month,
		TotalIncome:   totalIncome,
		TotalExpenses: totalExpenses,
		Balance:       totalIncome - totalExpenses,
		ByCategory:    byCategory,
	}

	writeJSON(w, http.StatusOK, resp)
}

// SetupDatabase initializes the database connection and runs migrations
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

// Serve starts the HTTP server with the configured routes
func (s *Server) Serve(addr string) error {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", s.HandleRoot)
	mux.HandleFunc("GET /api/transactions", s.HandleListTransactions)
	mux.HandleFunc("POST /api/transactions", s.HandleCreateTransaction)
	mux.HandleFunc("DELETE /api/transactions/{id}", s.HandleDeleteTransaction)
	mux.HandleFunc("GET /api/summary", s.HandleSummary)
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir(s.StaticDir))))
	slog.Info("starting server", "addr", addr)
	return http.ListenAndServe(addr, mux)
}
