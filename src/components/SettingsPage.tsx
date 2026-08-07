import { useRef, useState } from 'react'
import { CATEGORIES, CATEGORY_LABELS, Category, Settings } from '../types'
import { getSettings, saveSettings, getBalance, getEntries, exportBackup, importBackup } from '../storage'
import { todayStr } from '../dates'

function download(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

type Props = { onBack: () => void }

export default function SettingsPage({ onBack }: Props) {
  const [settings, setSettings] = useState<Settings>(getSettings)
  const [budgets, setBudgets] = useState<Record<Category, string>>(() => {
    const s = getSettings()
    return { food: String(s.dailyBudgets.food), groceries: String(s.dailyBudgets.groceries), dogs: String(s.dailyBudgets.dogs), miscellaneous: String(s.dailyBudgets.miscellaneous) }
  })
  const [msg, setMsg] = useState('')
  const [balance, setBalance] = useState<number | null>(getBalance)
  const [balanceInput, setBalanceInput] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const flash = (text: string) => {
    setMsg(text)
    setTimeout(() => setMsg(''), 2500)
  }

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
    flash('Settings saved.')
  }

  const handleSetBalance = () => {
    const num = parseFloat(balanceInput)
    if (isNaN(num)) return
    const updated: Settings = { ...getSettings(), balanceAnchor: { amount: num, ts: Date.now() } }
    saveSettings(updated)
    setSettings(updated)
    setBalance(getBalance())
    setBalanceInput('')
    flash('Balance set.')
  }

  const handleClearBalance = () => {
    if (!confirm('Stop tracking wallet balance?')) return
    const updated: Settings = { ...getSettings(), balanceAnchor: null }
    saveSettings(updated)
    setSettings(updated)
    setBalance(null)
  }

  const handleExportCsv = () => {
    const rows = [
      ['date', 'category', 'amount', 'note'],
      ...getEntries().map(e => [e.date, e.category, String(e.amount), e.note ?? '']),
    ]
    const csv = rows
      .map(r => r.map(v => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v).join(','))
      .join('\n')
    download(csv, `expenses-${todayStr()}.csv`, 'text/csv')
    flash('CSV exported.')
  }

  const handleDownloadBackup = () => {
    download(exportBackup(), `budget-backup-${todayStr()}.json`, 'application/json')
    flash('Backup downloaded.')
  }

  const handleRestoreFile = async (file: File) => {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      const count = Array.isArray(data.entries) ? data.entries.length : 0
      if (!confirm(`Replace ALL current data with this backup (${count} entries)?`)) return
      importBackup(text)
      window.location.reload()
    } catch {
      alert('That file is not a valid backup.')
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f4f8' }}>
      <div style={{ background: '#1a1a2e', padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ background: 'none', color: '#fff', fontSize: 22, padding: '4px 8px' }}>←</button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Settings</span>
      </div>

      <div style={{ padding: 16 }}>
        {/* Wallet balance */}
        <div style={sectionLabel}>Wallet Balance (฿)</div>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
          Enter how much money you have right now. Every expense you log from then on counts down from it.
        </p>
        {balance !== null && (
          <div style={{ background: '#fff', borderRadius: 10, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center' }}>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>Current balance</span>
            <span style={{ fontWeight: 800, fontSize: 18, color: balance < 0 ? '#e74c3c' : '#27ae60' }}>฿{balance.toLocaleString()}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type="number"
            value={balanceInput}
            onChange={e => setBalanceInput(e.target.value)}
            placeholder={balance !== null ? 'New balance…' : 'e.g. 80000'}
            style={{ flex: 1, border: '1px solid #ddd', borderRadius: 10, padding: '12px 14px', fontSize: 15, background: '#fff' }}
          />
          <button onClick={handleSetBalance} disabled={!balanceInput} style={{ ...btn, width: 'auto', padding: '0 20px', background: '#27ae60', opacity: balanceInput ? 1 : 0.5 }}>
            Set
          </button>
        </div>
        {balance !== null && (
          <button onClick={handleClearBalance} style={{ background: 'none', border: 'none', color: '#e74c3c', fontSize: 13, padding: '4px 0', marginBottom: 8 }}>
            Stop tracking balance
          </button>
        )}

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
        <button onClick={handleSave} style={{ ...btn, background: '#1a1a2e', marginTop: 8 }}>
          Save Settings
        </button>

        {/* Backup */}
        <div style={sectionLabel}>Backup &amp; Export</div>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
          All data lives on this phone. Download a backup now and then so you can restore it on a new device.
        </p>
        <button onClick={handleExportCsv} style={{ ...btn, background: '#2980b9', marginBottom: 8 }}>
          Export Expenses (CSV)
        </button>
        <button onClick={handleDownloadBackup} style={{ ...btn, background: '#27ae60', marginBottom: 8 }}>
          Download Backup (JSON)
        </button>
        <button onClick={() => fileInput.current?.click()} style={{ ...btn, background: '#8e44ad', marginBottom: 8 }}>
          Restore from Backup…
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleRestoreFile(f)
            e.target.value = ''
          }}
        />

        {msg && <div style={{ textAlign: 'center', fontSize: 14, color: '#555', margin: '8px 0 40px' }}>{msg}</div>}
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
