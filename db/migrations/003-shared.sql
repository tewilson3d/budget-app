-- Shared household budget: one pot for every member.
--
-- The PWA owns the shape of entries, bill payments and settings, so the server
-- stores each as the client's JSON document. Only the keys it needs to address
-- or order a row are pulled out into columns. The older per-user transactions
-- and budgets tables are left in place, unused.

CREATE TABLE IF NOT EXISTS entries (
    id         TEXT PRIMARY KEY,
    date       TEXT NOT NULL,      -- YYYY-MM-DD
    data       TEXT NOT NULL,      -- Entry JSON as the PWA sent it
    created_by TEXT NOT NULL,      -- member email
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_entries_date ON entries (date);

CREATE TABLE IF NOT EXISTS bill_payments (
    bill_id    TEXT NOT NULL,
    month      TEXT NOT NULL,      -- YYYY-MM
    data       TEXT NOT NULL,      -- BillPayment JSON as the PWA sent it
    created_by TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (bill_id, month)
);

-- A single row (id = 1) holding the Settings JSON: budgets, bills, balance.
CREATE TABLE IF NOT EXISTS settings (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    data       TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT
OR IGNORE INTO migrations (migration_number, migration_name)
VALUES
    (003, '003-shared');
