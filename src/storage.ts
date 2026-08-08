import { Entry, Settings, Bill, DEFAULT_SETTINGS } from './types';

const KEYS = { ENTRIES: 'budget_entries', SETTINGS: 'budget_settings', PAYMENTS: 'budget_bill_payments' };

// A bill checked off as paid for a given month. Name/amount are snapshotted
// so later edits to the bill don't rewrite payment history.
export type BillPayment = {
  billId: string;
  name: string;
  amount: number;
  month: string; // YYYY-MM
  ts: number;
};

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

export function getBillPayments(): BillPayment[] {
  try { return JSON.parse(localStorage.getItem(KEYS.PAYMENTS) ?? '[]'); }
  catch { return []; }
}

export function getPaymentsForMonth(month: string): BillPayment[] {
  return getBillPayments().filter(p => p.month === month);
}

// Returns the new paid state.
export function toggleBillPaid(bill: Bill, month: string): boolean {
  const payments = getBillPayments();
  const existing = payments.findIndex(p => p.billId === bill.id && p.month === month);
  if (existing >= 0) {
    payments.splice(existing, 1);
    localStorage.setItem(KEYS.PAYMENTS, JSON.stringify(payments));
    return false;
  }
  payments.push({ billId: bill.id, name: bill.name, amount: bill.amount, month, ts: Date.now() });
  localStorage.setItem(KEYS.PAYMENTS, JSON.stringify(payments));
  return true;
}

function entryTs(e: Entry): number {
  return e.ts ?? (parseInt(e.id) || 0);
}

// Current wallet balance: anchor amount minus everything spent since it was set
// (logged expenses and bill payments alike). Returns null if no balance is set.
export function getBalance(): number | null {
  const anchor = getSettings().balanceAnchor;
  if (!anchor) return null;
  const spentSince = getEntries()
    .filter(e => entryTs(e) > anchor.ts)
    .reduce((sum, e) => sum + e.amount, 0);
  const billsSince = getBillPayments()
    .filter(p => p.ts > anchor.ts)
    .reduce((sum, p) => sum + p.amount, 0);
  return anchor.amount - spentSince - billsSince;
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
  return JSON.stringify({ entries: getEntries(), settings: getSettings(), billPayments: getBillPayments() }, null, 2);
}

// Replaces all data with the backup's contents. Returns the number of entries restored.
export function importBackup(json: string): number {
  const data = JSON.parse(json);
  if (!Array.isArray(data.entries)) throw new Error('Not a valid backup file');
  localStorage.setItem(KEYS.ENTRIES, JSON.stringify(data.entries));
  if (data.settings) localStorage.setItem(KEYS.SETTINGS, JSON.stringify(data.settings));
  if (Array.isArray(data.billPayments)) localStorage.setItem(KEYS.PAYMENTS, JSON.stringify(data.billPayments));
  return data.entries.length;
}
