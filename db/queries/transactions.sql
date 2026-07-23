-- name: CreateTransaction :one
INSERT INTO
  transactions (user_id, amount, category, description, date, created_at)
VALUES
  (?, ?, ?, ?, ?, ?)
RETURNING
  *;

-- name: DeleteTransaction :execrows
DELETE FROM
  transactions
WHERE
  id = ? AND user_id = ?;

-- name: TransactionsForMonth :many
SELECT
  *
FROM
  transactions
WHERE
  user_id = ?
  AND substr(date, 1, 7) = ?
ORDER BY
  date DESC, id DESC;

-- name: CategoryTotalsForMonth :many
SELECT
  category,
  SUM(amount) AS total
FROM
  transactions
WHERE
  user_id = ?
  AND substr(date, 1, 7) = ?
GROUP BY
  category;

-- name: CategoryTotalsForDay :many
SELECT
  category,
  SUM(amount) AS total
FROM
  transactions
WHERE
  user_id = ?
  AND date = ?
GROUP BY
  category;

-- name: DayTotalsForMonth :many
SELECT
  date,
  SUM(amount) AS total
FROM
  transactions
WHERE
  user_id = ?
  AND substr(date, 1, 7) = ?
GROUP BY
  date
ORDER BY
  date;

-- name: ListBudgets :many
SELECT
  category, period, amount
FROM
  budgets
WHERE
  user_id = ?;

-- name: UpsertBudget :exec
INSERT INTO
  budgets (user_id, category, period, amount)
VALUES
  (?, ?, ?, ?)
ON CONFLICT (user_id, category) DO UPDATE SET
  period = excluded.period,
  amount = excluded.amount;
