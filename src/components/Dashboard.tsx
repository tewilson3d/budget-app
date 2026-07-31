import { useState, useEffect, useCallback } from 'react'
import { Category, CATEGORIES, CATEGORY_LABELS, CATEGORY_COLORS, Settings, DEFAULT_SETTINGS } from '../types'
import { getEntriesForDate, getSettings } from '../storage'

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function formatDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

type Props = {
  onAddExpense: (cat: Category) => void
  onHistory: () => void
  onSettings: () => void
}

export default function Dashboard({ onAddExpense, onHistory, onSettings }: Props) {
  const today = todayStr()
  const [spent, setSpent] = useState<Record<Category, number>>({ food: 0, groceries: 0, dogs: 0, miscellaneous: 0 })
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const load = useCallback(() => {
    const entries = getEntriesForDate(today)
    const totals: Record<Category, number> = { food: 0, groceries: 0, dogs: 0, miscellaneous: 0 }
    entries.forEach(e => { totals[e.category] += e.amount })
    setSpent(totals)
    setSettings(getSettings())
  }, [today])

  useEffect(() => { load() }, [load])

  const totalBudget = CATEGORIES.reduce((s, c) => s + settings.dailyBudgets[c], 0)
  const totalSpent = CATEGORIES.reduce((s, c) => s + spent[c], 0)
  const totalLeft = totalBudget - totalSpent

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f4f8' }}>
      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '16px 16px 20px', color: '#fff' }}>
        <div style={{ fontSize: 13, color: '#aaa', marginBottom: 12 }}>{formatDate(today)}</div>
        <div style={{ display: 'flex', gap: 0 }}>
          {[['Budget', `฿${totalBudget.toLocaleString()}`, '#fff'],
            ['Spent', `฿${totalSpent.toLocaleString()}`, totalSpent > totalBudget ? '#e74c3c' : '#2ecc71'],
            ['Left', `฿${totalLeft.toLocaleString()}`, totalLeft < 0 ? '#e74c3c' : '#2ecc71']
          ].map(([label, value, color], i) => (
            <div key={label} style={{ flex: 1, textAlign: 'center', borderRight: i < 2 ? '1px solid #333' : 'none' }}>
              <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: color as string, marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Category tiles */}
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CATEGORIES.map(cat => {
          const budget = settings.dailyBudgets[cat]
          const amount = spent[cat]
          const over = amount > budget
          const pct = budget > 0 ? Math.min(amount / budget, 1) : 0
          const color = CATEGORY_COLORS[cat]

          return (
            <div key={cat} style={{
              background: '#fff', borderRadius: 16, overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.07)'
            }}>
              <div style={{ height: 4, background: color }} />
              <div style={{ padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>{CATEGORY_LABELS[cat]}</div>

                {/* Progress bar */}
                <div style={{ height: 6, background: '#eee', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{ height: '100%', width: `${pct * 100}%`, background: over ? '#e74c3c' : color, borderRadius: 3, transition: 'width 0.3s' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>Spent</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: over ? '#e74c3c' : '#222' }}>฿{amount.toLocaleString()}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>Budget</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#555' }}>฿{budget.toLocaleString()}</div>
                  </div>
                </div>

                <div style={{ fontSize: 13, color: over ? '#e74c3c' : '#888', marginBottom: 12 }}>
                  {over ? `฿${(amount - budget).toLocaleString()} over budget` : `฿${(budget - amount).toLocaleString()} remaining`}
                </div>

                <button
                  onClick={() => onAddExpense(cat)}
                  style={{ width: '100%', background: color, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 0', fontWeight: 700, fontSize: 15 }}
                >
                  + Add Expense
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom nav */}
      <div style={{ display: 'flex', gap: 12, padding: '0 12px 32px' }}>
        {[['History', onHistory], ['Settings', onSettings]].map(([label, fn]) => (
          <button
            key={label as string}
            onClick={fn as () => void}
            style={{ flex: 1, background: '#fff', border: 'none', borderRadius: 12, padding: '14px 0', fontWeight: 600, fontSize: 15, color: '#1a1a2e', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}
          >
            {label as string}
          </button>
        ))}
      </div>
    </div>
  )
}
