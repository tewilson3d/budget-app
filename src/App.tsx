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

export type Screen = 'dashboard' | 'entry' | 'history' | 'month' | 'bills' | 'settings'

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [entryCategory, setEntryCategory] = useState<Category>('food')
  // Bumped when the other phone's changes arrive, to redraw the read-only
  // screens. Screens with edits in progress (entry, bills, settings) are left
  // alone and pick the changes up the next time they open.
  const [rev, setRev] = useState(0)
  const [syncError, setSyncErrorState] = useState(getSyncError)

  useEffect(() => {
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
  }, [])

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
