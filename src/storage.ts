import { Entry, Settings, DEFAULT_SETTINGS } from './types';

const KEYS = { ENTRIES: 'budget_entries', SETTINGS: 'budget_settings' };

export function getEntries(): Entry[] {
  try { return JSON.parse(localStorage.getItem(KEYS.ENTRIES) ?? '[]'); }
  catch { return []; }
}

export function saveEntry(entry: Entry): void {
  const entries = getEntries();
  entries.push(entry);
  localStorage.setItem(KEYS.ENTRIES, JSON.stringify(entries));
}

export function deleteEntry(id: string): void {
  localStorage.setItem(KEYS.ENTRIES, JSON.stringify(getEntries().filter(e => e.id !== id)));
}

export function getEntriesForDate(date: string): Entry[] {
  return getEntries().filter(e => e.date === date);
}

export function getEntriesForMonth(yearMonth: string): Entry[] {
  return getEntries().filter(e => e.date.startsWith(yearMonth));
}

function entryTs(e: Entry): number {
  return e.ts ?? (parseInt(e.id) || 0);
}

// Current wallet balance: anchor amount minus everything spent since it was set.
// Returns null if no balance has been set.
export function getBalance(): number | null {
  const anchor = getSettings().balanceAnchor;
  if (!anchor) return null;
  const spentSince = getEntries()
    .filter(e => entryTs(e) > anchor.ts)
    .reduce((sum, e) => sum + e.amount, 0);
  return anchor.amount - spentSince;
}

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEYS.SETTINGS);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(s));
}

export function exportBackup(): string {
  return JSON.stringify({ entries: getEntries(), settings: getSettings() }, null, 2);
}

// Replaces all data with the backup's contents. Returns the number of entries restored.
export function importBackup(json: string): number {
  const data = JSON.parse(json);
  if (!Array.isArray(data.entries)) throw new Error('Not a valid backup file');
  localStorage.setItem(KEYS.ENTRIES, JSON.stringify(data.entries));
  if (data.settings) localStorage.setItem(KEYS.SETTINGS, JSON.stringify(data.settings));
  return data.entries.length;
}
