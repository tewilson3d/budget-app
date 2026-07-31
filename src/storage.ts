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

export function getSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEYS.SETTINGS);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch { return DEFAULT_SETTINGS; }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(s));
}
