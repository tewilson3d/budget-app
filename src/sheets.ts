import { Entry, Category } from './types';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

const MONTH_TABS: Record<string, string> = {
  '2025-06': 'June', '2025-07': 'July', '2025-08': 'August',
  '2025-09': 'September', '2025-10': 'October', '2025-11': 'November',
  '2025-12': 'December', '2026-01': 'January', '2026-02': 'February',
  '2026-03': 'March', '2026-04': 'April', '2026-05': 'May',
  '2026-06': 'June 2026', '2026-07': 'July 2026', '2026-08': 'August 2026',
};

const CATEGORY_ROWS: Record<Category, number> = {
  dogs: 4, food: 5, groceries: 6, miscellaneous: 7,
};

function dayToCol(day: number): string {
  const col = day + 1; // col A = label, col B = day 1
  return col <= 26
    ? String.fromCharCode(64 + col)
    : String.fromCharCode(64 + Math.floor((col - 1) / 26)) + String.fromCharCode(64 + ((col - 1) % 26) + 1);
}

export async function syncToSheet(
  sheetId: string,
  token: string,
  entries: Entry[]
): Promise<{ synced: number; errors: number }> {
  const cells = new Map<string, number>();

  for (const e of entries) {
    const [y, m, d] = e.date.split('-');
    const tab = MONTH_TABS[`${y}-${m}`];
    if (!tab) continue;
    const range = `'${tab}'!${dayToCol(parseInt(d))}${CATEGORY_ROWS[e.category]}`;
    cells.set(range, (cells.get(range) ?? 0) + e.amount);
  }

  if (!cells.size) return { synced: 0, errors: 0 };

  const res = await fetch(`${BASE}/${sheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: Array.from(cells.entries()).map(([range, value]) => ({ range, values: [[value]] })),
    }),
  });

  return res.ok ? { synced: cells.size, errors: 0 } : { synced: 0, errors: cells.size };
}
