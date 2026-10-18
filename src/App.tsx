import { useEffect, useState } from 'react'
import BillsPage from './components/BillsPage'
import Dashboard from './components/Dashboard'
import EntryForm from './components/EntryForm'
import History from './components/History'
import MonthPage from './components/MonthPage'
import SettingsPage from './components/SettingsPage'
import { Category } from './types'
import { startSync, SYNCED_EVENT } from './sync'
import { getSyncError, setSyncError, SYNC_ERROR_EVENT } from './outbox'
import { captureAccessKeyFromUrl, saveAccessKey } from './auth'
import { APP_VERSION } from './version'

export type Screen = 'dashboard' | 'entry' | 'history' | 'month' | 'bills' | 'settings'

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [entryCategory, setEntryCategory] = useState<Category>('food')
  // Bumped when the other phone's changes arrive, to redraw the read-only
  // screens. Screens with edits in progress (entry, bills, settings) are left
  // alone and pick the changes up the next time they open.
  const [rev, setRev] = useState(0)
  const [syncError, setSyncErrorState] = useState(getSyncError)
  const [accessKey, setAccessKey] = useState(captureAccessKeyFromUrl)

  useEffect(() => {
    if (!accessKey) return

    const onSynced = () => setRev(r => r + 1)
    const onError = () => setSyncErrorState(getSyncError())
    window.addEventListener(SYNCED_EVENT, onSynced)
    window.addEventListener(SYNC_ERROR_EVENT, onError)
    const stop = startSync()
    return () => {
      stop()
      window.removeEventListener(SYNCED_EVENT, onSynced)
      window.removeEventListener(SYNC_ERROR_EVENT, onError)
    }
  }, [accessKey])

  if (!accessKey) return <UnlockPage onUnlocked={setAccessKey} />

  const openEntry = (cat: Category) => {
    setEntryCategory(cat)
    setScreen('entry')
  }

  return (
    <>
      {syncError && (
        <div role="alert" style={{ background: '#fdecea', color: '#8a1c1c', padding: '10px 16px', fontSize: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{syncError}</span>
          <button onClick={() => setSyncError(null)} style={{ background: 'none', color: '#8a1c1c', fontWeight: 700 }}>OK</button>
        </div>
      )}
      {screen === 'dashboard' && (
        <Dashboard key={rev} onAddExpense={openEntry} onHistory={() => setScreen('history')} onMonth={() => setScreen('month')} onBills={() => setScreen('bills')} onSettings={() => setScreen('settings')} />
      )}
      {screen === 'month' && (
        <MonthPage key={rev} onBack={() => setScreen('dashboard')} />
      )}
      {screen === 'bills' && (
        <BillsPage onBack={() => setScreen('dashboard')} />
      )}
      {screen === 'entry' && (
        <EntryForm initialCategory={entryCategory} onBack={() => setScreen('dashboard')} />
      )}
      {screen === 'history' && (
        <History key={rev} onBack={() => setScreen('dashboard')} />
      )}
      {screen === 'settings' && (
        <SettingsPage onBack={() => setScreen('dashboard')} />
      )}
    </>
  )
}

function UnlockPage({ onUnlocked }: { onUnlocked: (key: string) => void }) {
  const [key, setKey] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  const unlock = async () => {
    const value = key.trim()
    if (!value) return
    setChecking(true)
    setError('')
    try {
      const response = await fetch('/api/state', {
        headers: { 'X-Budget-Key': value },
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'manual',
      })
      if (!response.ok) {
        setError(response.status === 401 ? 'That access key is not correct.' : 'Could not unlock the budget app.')
        return
      }
      saveAccessKey(value)
      onUnlocked(value)
    } catch {
      setError('Could not reach the VM. Check your connection and try again.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#1a1a2e', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#fff', borderRadius: 18, padding: 24, boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#1a1a2e', marginBottom: 8 }}>Budget Tracker</div>
        <p style={{ color: '#777', fontSize: 14, lineHeight: 1.5, margin: '0 0 18px' }}>
          Enter the standalone app access key once. This device will stay signed in without opening a browser.
        </p>
        <input
          autoFocus
          type="password"
          value={key}
          onChange={event => setKey(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') void unlock() }}
          placeholder="Access key"
          autoComplete="current-password"
          style={{ width: '100%', border: '1px solid #ccc', borderRadius: 10, padding: '13px 14px', fontSize: 16, marginBottom: 10 }}
        />
        {error && <div style={{ color: '#c0392b', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <button
          onClick={() => void unlock()}
          disabled={!key.trim() || checking}
          style={{ width: '100%', border: 'none', borderRadius: 10, padding: 14, background: '#00897b', color: '#fff', fontSize: 16, fontWeight: 700, opacity: !key.trim() || checking ? 0.55 : 1 }}
        >
          {checking ? 'Unlocking…' : 'Unlock App'}
        </button>
        <div style={{ textAlign: 'center', color: '#aaa', fontSize: 11, marginTop: 16 }}>v{APP_VERSION}</div>
      </div>
    </div>
  )
}
