import { applyServerState, localState, SharedState } from './storage';
import { flush, goToLogin, loggedOut, onFirstImportDone, pendingCount, queue } from './outbox';

// Keeps this phone's copy in step with the shared budget: send this phone's
// queued changes, then take the server's copy.
//
// The first time a phone runs the shared version, it sends the history it
// already has (a merge: nothing on the server is overwritten). Until that has
// gone through, the server's copy is never pulled down, so a phone can never
// lose history that only it has.

const IMPORTED = 'budget_shared_import_done';
export const SYNCED_EVENT = 'budget:synced';

onFirstImportDone(() => localStorage.setItem(IMPORTED, '1'));

function queueFirstImport(): void {
  const local = localState();
  if (local.entries.length === 0 && local.billPayments.length === 0 && !local.settings) {
    localStorage.setItem(IMPORTED, '1'); // nothing to share
    return;
  }
  queue({
    method: 'POST',
    path: '/api/import',
    body: { mode: 'merge', ...local },
    firstImport: true,
  });
}

let running: Promise<void> | null = null;

export function sync(): Promise<void> {
  if (!running) running = syncOnce().finally(() => { running = null; });
  return running;
}

async function syncOnce(): Promise<void> {
  if (!localStorage.getItem(IMPORTED) && pendingCount() === 0) queueFirstImport();
  if (!(await flush())) return; // offline: keep this phone's changes until they're sent
  if (!localStorage.getItem(IMPORTED)) return; // first import was refused; see the sync error

  let state: SharedState;
  try {
    const res = await fetch('/api/state', { credentials: 'same-origin', cache: 'no-store', redirect: 'manual' });
    if (loggedOut(res)) { goToLogin(); return; }
    if (!res.ok) return;
    state = (await res.json()) as SharedState;
  } catch {
    return; // offline, or not the JSON we expect
  }
  if (!Array.isArray(state?.entries) || !Array.isArray(state?.billPayments)) return;
  if (pendingCount() > 0) return; // changed while loading; the next sync catches up
  if (applyServerState(state)) window.dispatchEvent(new Event(SYNCED_EVENT));
}

// Syncs now, whenever the app comes back to the foreground or online, and
// every 30 seconds while it is open, so each of you sees the other's spending.
export function startSync(): () => void {
  const onVisible = () => { if (document.visibilityState === 'visible') void sync(); };
  const timer = window.setInterval(onVisible, 30_000);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onVisible);
  void sync();
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onVisible);
  };
}
