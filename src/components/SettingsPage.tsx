import { useState } from 'react'
import { CATEGORIES, CATEGORY_LABELS, Category, Settings } from '../types'
import { getSettings, saveSettings } from '../storage'
import { isAuthenticated, startGoogleAuth, clearAccessToken, getAccessToken } from '../auth'
import { syncToSheet } from '../sheets'
import { getEntriesForMonth } from '../storage'

function currentYearMonth() {
  return new Date().toISOString().slice(0, 7)
}

type Props = { onBack: () => void }

export default function SettingsPage({ onBack }: Props) {
  const [settings, setSettings] = useState<Settings>(getSettings)
  const [budgets, setBudgets] = useState<Record<Category, string>>(() => {
    const s = getSettings()
    return { food: String(s.dailyBudgets.food), groceries: String(s.dailyBudgets.groceries), dogs: String(s.dailyBudgets.dogs), miscellaneous: String(s.dailyBudgets.miscellaneous) }
  })
  const [authed, setAuthed] = useState(isAuthenticated)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const handleSave = () => {
    const updated: Settings = {
      ...settings,
      dailyBudgets: {
        food: parseFloat(budgets.food) || 0,
        groceries: parseFloat(budgets.groceries) || 0,
        dogs: parseFloat(budgets.dogs) || 0,
        miscellaneous: parseFloat(budgets.miscellaneous) || 0,
      }
    }
    saveSettings(updated)
    setSettings(updated)
    setSyncMsg('Settings saved.')
    setTimeout(() => setSyncMsg(''), 2000)
  }

  const handleConnect = () => {
    if (!settings.googleClientId) {
      alert('Paste your Google Client ID first.')
      return
    }
    startGoogleAuth(settings.googleClientId, window.location.origin + '/')
  }

  const handleDisconnect = () => {
    clearAccessToken()
    setAuthed(false)
  }

  const handleSync = async () => {
    const token = getAccessToken()
    if (!token) { alert('Connect Google account first.'); return }
    setSyncing(true)
    setSyncMsg('')
    const entries = getEntriesForMonth(currentYearMonth())
    const result = await syncToSheet(settings.sheetId, token, entries)
    setSyncing(false)
    setSyncMsg(result.errors ? `⚠ ${result.errors} errors` : `✓ ${result.synced} cells synced`)
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f4f8' }}>
      <div style={{ background: '#1a1a2e', padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ background: 'none', color: '#fff', fontSize: 22, padding: '4px 8px' }}>←</button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Settings</span>
      </div>

      <div style={{ padding: 16 }}>
        {/* Daily budgets */}
        <div style={sectionLabel}>Daily Budgets (฿)</div>
        {CATEGORIES.map(cat => (
          <div key={cat} style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center' }}>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{CATEGORY_LABELS[cat]}</span>
            <input
              type="number"
              value={budgets[cat]}
              onChange={e => setBudgets(prev => ({ ...prev, [cat]: e.target.value }))}
              style={{ width: 100, textAlign: 'right', border: '1px solid #ddd', borderRadius: 8, padding: '8px 10px', fontSize: 15 }}
            />
          </div>
        ))}

        {/* Google Sheets */}
        <div style={sectionLabel}>Google Sheets Sync</div>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>Paste your OAuth Client ID (Web application type) from Google Cloud Console.</p>
        <input
          type="text"
          value={settings.googleClientId}
          onChange={e => setSettings(s => ({ ...s, googleClientId: e.target.value }))}
          placeholder="...apps.googleusercontent.com"
          style={{ width: '100%', border: '1px solid #ddd', borderRadius: 10, padding: '12px 14px', fontSize: 14, marginBottom: 12, background: '#fff' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: 5, background: authed ? '#2ecc71' : '#e74c3c' }} />
          <span style={{ fontSize: 14, color: '#555' }}>{authed ? 'Connected to Google' : 'Not connected'}</span>
        </div>

        {authed ? (
          <>
            <button onClick={handleSync} disabled={syncing} style={{ ...btn, background: '#27ae60', marginBottom: 8 }}>
              {syncing ? 'Syncing…' : 'Sync This Month to Sheet'}
            </button>
            <button onClick={handleDisconnect} style={{ ...btn, background: '#e74c3c', marginBottom: 8 }}>
              Disconnect Google Account
            </button>
          </>
        ) : (
          <button onClick={handleConnect} style={{ ...btn, background: '#4285F4', marginBottom: 8 }}>
            Connect Google Account
          </button>
        )}

        {syncMsg && <div style={{ textAlign: 'center', fontSize: 14, color: '#555', marginBottom: 8 }}>{syncMsg}</div>}

        <button onClick={handleSave} style={{ ...btn, background: '#1a1a2e', marginTop: 8, marginBottom: 40 }}>
          Save Settings
        </button>
      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: '#888',
  textTransform: 'uppercase', letterSpacing: 1,
  marginTop: 24, marginBottom: 10,
}

const btn: React.CSSProperties = {
  display: 'block', width: '100%',
  padding: '14px 0', borderRadius: 12,
  color: '#fff', fontWeight: 700, fontSize: 15,
  border: 'none',
}
