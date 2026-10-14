-- name: ListEntries :many
SELECT
  data
FROM
  entries
ORDER BY
  date, rowid;

-- name: UpsertEntry :exec
INSERT INTO
  entries (id, date, data, created_by, updated_at)
VALUES
  (?, ?, ?, ?, ?)
ON CONFLICT (id) DO UPDATE SET
  date = excluded.date,
  data = excluded.data,
  updated_at = excluded.updated_at;

-- name: InsertEntryIfMissing :exec
INSERT
OR IGNORE INTO entries (id, date, data, created_by, updated_at)
VALUES
  (?, ?, ?, ?, ?);

-- name: DeleteEntry :execrows
DELETE FROM
  entries
WHERE
  id = ?;

-- name: DeleteAllEntries :exec
DELETE FROM
  entries;

-- name: ListBillPayments :many
SELECT
  data
FROM
  bill_payments
ORDER BY
  month, rowid;

-- name: UpsertBillPayment :exec
INSERT INTO
  bill_payments (bill_id, month, data, created_by, updated_at)
VALUES
  (?, ?, ?, ?, ?)
ON CONFLICT (bill_id, month) DO UPDATE SET
  data = excluded.data,
  updated_at = excluded.updated_at;

-- name: InsertBillPaymentIfMissing :exec
INSERT
OR IGNORE INTO bill_payments (bill_id, month, data, created_by, updated_at)
VALUES
  (?, ?, ?, ?, ?);

-- name: DeleteBillPayment :execrows
DELETE FROM
  bill_payments
WHERE
  bill_id = ? AND month = ?;

-- name: DeleteAllBillPayments :exec
DELETE FROM
  bill_payments;

-- name: GetSettings :one
SELECT
  data
FROM
  settings
WHERE
  id = 1;

-- name: UpsertSettings :exec
INSERT INTO
  settings (id, data, updated_by, updated_at)
VALUES
  (1, ?, ?, ?)
ON CONFLICT (id) DO UPDATE SET
  data = excluded.data,
  updated_by = excluded.updated_by,
  updated_at = excluded.updated_at;

-- name: InsertSettingsIfMissing :exec
INSERT
OR IGNORE INTO settings (id, data, updated_by, updated_at)
VALUES
  (1, ?, ?, ?);
