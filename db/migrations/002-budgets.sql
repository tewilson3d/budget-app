-- Budgets: per-user, per-category spending targets.
-- period is 'daily' or 'monthly'. App-display only; never pushed to Sheets.
CREATE TABLE IF NOT EXISTS budgets (
    user_id  TEXT NOT NULL,
    category TEXT NOT NULL,
    period   TEXT NOT NULL,
    amount   REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, category)
);

INSERT
OR IGNORE INTO migrations (migration_number, migration_name)
VALUES
    (002, '002-budgets');
