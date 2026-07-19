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

-- name: SummaryForMonth :many
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
