import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import EntryForm from './components/EntryForm'
import History from './components/History'
import SettingsPage from './components/SettingsPage'
import { handleAuthCallback } from './auth'
import { Category } from './types'

export type Screen = 'dashboard' | 'entry' | 'history' | 'settings'

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [entryCategory, setEntryCategory] = useState<Category>('food')

  // Handle Google OAuth redirect back to the app
  useEffect(() => {
    if (window.location.hash.includes('access_token')) {
      handleAuthCallback()
      setScreen('settings')
    }
  }, [])

  const openEntry = (cat: Category) => {
    setEntryCategory(cat)
    setScreen('entry')
  }

  return (
    <>
      {screen === 'dashboard' && (
        <Dashboard onAddExpense={openEntry} onHistory={() => setScreen('history')} onSettings={() => setScreen('settings')} />
      )}
      {screen === 'entry' && (
        <EntryForm initialCategory={entryCategory} onBack={() => setScreen('dashboard')} />
      )}
      {screen === 'history' && (
        <History onBack={() => setScreen('dashboard')} />
      )}
      {screen === 'settings' && (
        <SettingsPage onBack={() => setScreen('dashboard')} />
      )}
    </>
  )
}
