package srv

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"html/template"
	"log/slog"
	"net/http"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"srv.exe.dev/db"
	"srv.exe.dev/db/dbgen"
)

// Category is a fixed spending category with display metadata.
type Category struct {
	Name   string `json:"name"`
	Icon   string `json:"icon"`
	Color  string `json:"color"`
	Period string `json:"period"` // "daily" or "monthly"
}

// Categories is the fixed list offered by the UI. Food is a daily budget; the
// rest are monthly. Order matters (drives the 2x2 grid layout).
var Categories = []Category{
	{Name: "Food", Icon: "\U0001F35C", Color: "#f97316", Period: "daily"},
	{Name: "Groceries", Icon: "\U0001F6D2", Color: "#3b82f6", Period: "monthly"},
	{Name: "Dogs", Icon: "\U0001F436", Color: "#a855f7", Period: "monthly"},
	{Name: "Miscellaneous", Icon: "\U0001F4E6", Color: "#6b7280", Period: "monthly"},
}

func validCategory(name string) bool {
	for _, c := range Categories {
		if c.Name == name {
			return true
		}
	}
	return false
}

func categoryPeriod(name string) string {
	for _, c := range Categories {
		if c.Name == name {
			return c.Period
		}
	}
	return "monthly"
}

// defaultBudgets seeds sensible starting values (only Food has a real target).
var defaultBudgets = map[string]float64{
	"Food":          1000,
	"Groceries":     0,
	"Dogs":          0,
	"Miscellaneous": 0,
}

type Server struct {
	DB           *sql.DB
	Hostname     string
	TemplatesDir string
	StaticDir    string
}

type pageData struct {
	Hostname   string
	Categories []Category
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

// requireUser returns the authenticated user id. In local/dev (no proxy header)
// it falls back to a fixed local user so the app is usable directly.
func requireUser(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID := userIDFromRequest(r)
	if userID == "" {
		userID = "local"
	}
	return userID, true
}

// ---- Month/date helpers ----

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

// daysInMonth returns the number of days in the given YYYY-MM string.
func daysInMonth(month string) int {
	t, err := time.Parse("2006-01", month)
	if err != nil {
		return 30
	}
	return time.Date(t.Year(), t.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

// ---- API types ----

type transactionResponse struct {
	ID        int64   `json:"id"`
	Amount    float64 `json:"amount"`
	Category  string  `json:"category"`
	Date      string  `json:"date"`
	CreatedAt string  `json:"created_at"`
}

func toTransactionResponse(t dbgen.Transaction) transactionResponse {
	return transactionResponse{
		ID:        t.ID,
		Amount:    t.Amount,
		Category:  t.Category,
		Date:      t.Date,
		CreatedAt: t.CreatedAt.Format(time.RFC3339),
	}
}

type createTransactionRequest struct {
	Amount   float64 `json:"amount"`
	Category string  `json:"category"`
	Date     string  `json:"date"`
}

// ---- Transaction handlers ----

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
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Category = strings.TrimSpace(req.Category)
	req.Date = strings.TrimSpace(req.Date)

	if !validCategory(req.Category) {
		writeJSONError(w, http.StatusBadRequest, "invalid category")
		return
	}
	if req.Amount <= 0 {
		writeJSONError(w, http.StatusBadRequest, "amount must be positive")
		return
	}
	if req.Date == "" {
		req.Date = time.Now().Format("2006-01-02")
	}
	if _, err := time.Parse("2006-01-02", req.Date); err != nil {
		writeJSONError(w, http.StatusBadRequest, "date must be in YYYY-MM-DD format")
		return
	}

	q := dbgen.New(s.DB)
	txn, err := q.CreateTransaction(r.Context(), dbgen.CreateTransactionParams{
		UserID:      userID,
		Amount:      req.Amount,
		Category:    req.Category,
		Description: nil,
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
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid transaction id")
		return
	}
	q := dbgen.New(s.DB)
	rows, err := q.DeleteTransaction(r.Context(), dbgen.DeleteTransactionParams{ID: id, UserID: userID})
	if err != nil {
		slog.Error("delete transaction", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to delete transaction")
		return
	}
	if rows == 0 {
		writeJSONError(w, http.StatusNotFound, "transaction not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
}

// ---- Summary / overview ----

type categoryOverview struct {
	Category string  `json:"category"`
	Period   string  `json:"period"`
	Spent    float64 `json:"spent"`  // period-relevant spend (today for daily, month for monthly)
	Month    float64 `json:"month"`  // month-to-date spend
	Budget   float64 `json:"budget"` // target for the period
}

// HandleSummary handles GET /api/summary?month=YYYY-MM
// Returns today's food status + per-category overview for the month.
func (s *Server) HandleSummary(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	month := monthFromRequest(r)
	today := time.Now().Format("2006-01-02")

	q := dbgen.New(s.DB)

	monthRows, err := q.CategoryTotalsForMonth(r.Context(), dbgen.CategoryTotalsForMonthParams{UserID: userID, Date: month})
	if err != nil {
		slog.Error("month totals", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to compute summary")
		return
	}
	monthByCat := map[string]float64{}
	var monthTotal float64
	for _, row := range monthRows {
		v := valOf(row.Total)
		monthByCat[row.Category] = v
		monthTotal += v
	}

	dayRows, err := q.CategoryTotalsForDay(r.Context(), dbgen.CategoryTotalsForDayParams{UserID: userID, Date: today})
	if err != nil {
		slog.Error("day totals", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to compute summary")
		return
	}
	dayByCat := map[string]float64{}
	var dayTotal float64
	for _, row := range dayRows {
		v := valOf(row.Total)
		dayByCat[row.Category] = v
		dayTotal += v
	}

	budgets, err := s.budgetMap(r.Context(), userID)
	if err != nil {
		slog.Error("budgets", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to load budgets")
		return
	}

	dim := daysInMonth(month)
	overview := make([]categoryOverview, 0, len(Categories))
	for _, c := range Categories {
		b := budgets[c.Name]
		periodBudget := b
		periodSpent := monthByCat[c.Name]
		if c.Period == "daily" {
			periodBudget = b * float64(dim) // monthly target = daily * days
		}
		overview = append(overview, categoryOverview{
			Category: c.Name,
			Period:   c.Period,
			Spent:    periodSpent,
			Month:    monthByCat[c.Name],
			Budget:   periodBudget,
		})
	}

	now := time.Now()
	dayOfMonth := now.Day()
	if month != now.Format("2006-01") {
		dayOfMonth = dim // past/future month: use full month for pace
	}

	foodDaily := budgets["Food"]
	writeJSON(w, http.StatusOK, map[string]any{
		"month":         month,
		"days_in_month": dim,
		"day_of_month":  dayOfMonth,
		"month_total":   monthTotal,
		"today": map[string]any{
			"date":         today,
			"total":        dayTotal,
			"food":         dayByCat["Food"],
			"food_budget":  foodDaily,
		},
		"food_month_pace": foodDaily * float64(dayOfMonth),
		"categories":      overview,
	})
}

func valOf(p *float64) float64 {
	if p == nil {
		return 0
	}
	return *p
}

// ---- Budgets ----

func (s *Server) budgetMap(ctx context.Context, userID string) (map[string]float64, error) {
	q := dbgen.New(s.DB)
	rows, err := q.ListBudgets(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := map[string]float64{}
	for k, v := range defaultBudgets {
		out[k] = v
	}
	for _, r := range rows {
		out[r.Category] = r.Amount
	}
	return out, nil
}

type budgetEntry struct {
	Category string  `json:"category"`
	Period   string  `json:"period"`
	Amount   float64 `json:"amount"`
}

// HandleListBudgets handles GET /api/budgets
func (s *Server) HandleListBudgets(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	budgets, err := s.budgetMap(r.Context(), userID)
	if err != nil {
		slog.Error("list budgets", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to load budgets")
		return
	}
	out := make([]budgetEntry, 0, len(Categories))
	for _, c := range Categories {
		out = append(out, budgetEntry{Category: c.Name, Period: c.Period, Amount: budgets[c.Name]})
	}
	writeJSON(w, http.StatusOK, map[string]any{"budgets": out})
}

// HandleUpdateBudget handles PUT /api/budgets/{category}
func (s *Server) HandleUpdateBudget(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUser(w, r)
	if !ok {
		return
	}
	category := r.PathValue("category")
	if !validCategory(category) {
		writeJSONError(w, http.StatusBadRequest, "invalid category")
		return
	}
	var body struct {
		Amount float64 `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Amount < 0 {
		writeJSONError(w, http.StatusBadRequest, "amount must be non-negative")
		return
	}
	q := dbgen.New(s.DB)
	if err := q.UpsertBudget(r.Context(), dbgen.UpsertBudgetParams{
		UserID:   userID,
		Category: category,
		Period:   categoryPeriod(category),
		Amount:   body.Amount,
	}); err != nil {
		slog.Error("upsert budget", "error", err)
		writeJSONError(w, http.StatusInternalServerError, "failed to save budget")
		return
	}
	writeJSON(w, http.StatusOK, budgetEntry{Category: category, Period: categoryPeriod(category), Amount: body.Amount})
}

// HandlePushSheet handles POST /api/push — stub until Google OAuth is wired.
func (s *Server) HandlePushSheet(w http.ResponseWriter, r *http.Request) {
	if _, ok := requireUser(w, r); !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      false,
		"pending": true,
		"message": "Google Sheets sync not connected yet",
	})
}

// ---- Setup / serve ----

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

// Serve starts the HTTP server with the configured routes.
func (s *Server) Serve(addr string) error {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", s.HandleRoot)
	mux.HandleFunc("GET /api/transactions", s.HandleListTransactions)
	mux.HandleFunc("POST /api/transactions", s.HandleCreateTransaction)
	mux.HandleFunc("DELETE /api/transactions/{id}", s.HandleDeleteTransaction)
	mux.HandleFunc("GET /api/summary", s.HandleSummary)
	mux.HandleFunc("GET /api/budgets", s.HandleListBudgets)
	mux.HandleFunc("PUT /api/budgets/{category}", s.HandleUpdateBudget)
	mux.HandleFunc("POST /api/push", s.HandlePushSheet)
	mux.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir(s.StaticDir))))
	slog.Info("starting server", "addr", addr)
	return http.ListenAndServe(addr, mux)
}
