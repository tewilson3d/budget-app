import { apiHeaders, clearAccessKey } from './auth'

// Changes waiting to reach the shared budget on the server.
//
// storage.ts writes every change to this phone's copy first, so the app stays
// instant and works offline, then queues the matching API call here. The queue
// lives in localStorage, so it survives the app being closed, and is sent in
// order whenever the server is reachable. Every call is safe to repeat.

export type Op = {
  method: 'PUT' | 'DELETE' | 'POST';
  path: string;
  body?: unknown;
  firstImport?: boolean; // this phone's pre-sharing history; see sync.ts
};

const OUTBOX = 'budget_outbox';
const SYNC_ERROR = 'budget_sync_error';

function readOutbox(): Op[] {
  try { return JSON.parse(localStorage.getItem(OUTBOX) ?? '[]'); }
  catch { return []; }
}

function writeOutbox(ops: Op[]): void {
  localStorage.setItem(OUTBOX, JSON.stringify(ops));
}

export function pendingCount(): number {
  return readOutbox().length;
}

export function queue(op: Op): void {
  writeOutbox([...readOutbox(), op]);
  void flush();
}

// The last change the server refused, shown to the user so nothing is lost silently.
export function getSyncError(): string | null {
  return localStorage.getItem(SYNC_ERROR);
}

export const SYNC_ERROR_EVENT = 'budget:sync-error';

export function setSyncError(message: string | null): void {
  if (message) localStorage.setItem(SYNC_ERROR, message);
  else localStorage.removeItem(SYNC_ERROR);
  window.dispatchEvent(new Event(SYNC_ERROR_EVENT));
}

// A 401 means this device's standalone access key is missing or no longer
// valid. Redirects are also treated as locked during the private-to-public
// proxy transition.
export function loggedOut(res: Response): boolean {
  return res.type === 'opaqueredirect' || res.status === 401 || (res.status >= 300 && res.status < 400);
}

let redirecting = false;

// Return to the in-app unlock screen instead of opening an external browser.
export function goToLogin(): void {
  if (redirecting) return;
  redirecting = true;
  clearAccessKey();
  window.location.reload();
}

let flushing: Promise<boolean> | null = null;
let onImported: (() => void) | null = null;

export function onFirstImportDone(fn: () => void): void {
  onImported = fn;
}

// Sends queued changes in order. Resolves true once nothing is left queued,
// false if the server could not be reached (the rest stay queued for later).
export function flush(): Promise<boolean> {
  if (!flushing) flushing = sendAll().finally(() => { flushing = null; });
  return flushing;
}

async function sendAll(): Promise<boolean> {
  for (;;) {
    const ops = readOutbox();
    if (ops.length === 0) return true;
    const op = ops[0];
    let res: Response;
    try {
      res = await fetch(op.path, {
        method: op.method,
        headers: apiHeaders(op.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        body: op.body === undefined ? undefined : JSON.stringify(op.body),
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'manual',
      });
    } catch {
      return false; // offline
    }
    if (loggedOut(res)) { goToLogin(); return false; }
    if (res.status === 403 || res.status === 408 || res.status === 429 || res.status >= 500) return false;
    if (!res.ok) {
      // The server will never accept this one (a 400): drop it so the queue
      // isn't stuck, but say so.
      const detail = await res.json().then(j => j.error as string).catch(() => `error ${res.status}`);
      setSyncError(`A change could not be shared: ${detail}`);
      console.warn('server refused change', op, detail);
    } else if (op.firstImport) {
      onImported?.();
    }
    // Only this function removes ops, and only from the front, so anything
    // queued meanwhile is kept.
    writeOutbox(readOutbox().slice(1));
  }
}
