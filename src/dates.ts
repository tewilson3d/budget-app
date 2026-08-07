// Local-timezone date strings. Never use toISOString() for these — it's UTC,
// so before 7am in Thailand it returns yesterday's date.
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function currentYearMonth(): string {
  return todayStr().slice(0, 7);
}
