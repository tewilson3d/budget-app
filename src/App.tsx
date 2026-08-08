import { useState } from 'react'
import BillsPage from './components/BillsPage'
import Dashboard from './components/Dashboard'
import EntryForm from './components/EntryForm'
import History from './components/History'
import MonthPage from './components/MonthPage'
import SettingsPage from './components/SettingsPage'
import { Category } from './types'

export type Screen = 'dashboard' | 'entry' | 'history' | 'month' | 'bills' | 'settings'

export default function App() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [entryCategory, setEntryCategory] = useState<Category>('food')

  const openEntry = (cat: Category) => {
    setEntryCategory(cat)
    setScreen('entry')
  }

  return (
    <>
      {screen === 'dashboard' && (
        <Dashboard onAddExpense={openEntry} onHistory={() => setScreen('history')} onMonth={() => setScreen('month')} onBills={() => setScreen('bills')} onSettings={() => setScreen('settings')} />
      )}
      {screen === 'month' && (
        <MonthPage onBack={() => setScreen('dashboard')} />
      )}
      {screen === 'bills' && (
        <BillsPage onBack={() => setScreen('dashboard')} />
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
