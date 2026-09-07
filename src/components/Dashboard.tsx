import { useState, useEffect, useCallback } from 'react'
import { Category, CATEGORIES, CATEGORY_LABELS, CATEGORY_COLORS, Settings, DEFAULT_SETTINGS } from '../types'
import { getEntriesForDate, getSettings, getBalance, getPace, getPaymentsForMonth, Pace } from '../storage'
import { todayStr, currentYearMonth } from '../dates'

function formatDate(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

const shortDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const baht = (n: number) => `${n < 0 ? '-' : ''}฿${Math.abs(Math.round(n)).toLocaleString()}`

const label: React.CSSProperties = { fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }

type Props = {
  onAddExpense: (cat: Category) => void
  onHistory: () => void
  onMonth: () => void
  onBills: () => void
  onSettings: () => void
}

export default function Dashboard({ onAddExpense, onHistory, onMonth, onBills, onSettings }: Props) {
  const today = todayStr()
  const [spent, setSpent] = useState<Record<Category, number>>({ food: 0, groceries: 0, dogs: 0, miscellaneous: 0 })
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [balance, setBalance] = useState<number | null>(null)
  const [pace, setPace] = useState<Pace>({ perDay: 0, days: 0, fromBudget: true })
  const [billsPaidThisMonth, setBillsPaidThisMonth] = useState(0)

  const load = useCallback(() => {
    const entries = getEntriesForDate(today)
    const totals: Record<Category, number> = { food: 0, groceries: 0, dogs: 0, miscellaneous: 0 }
    entries.forEach(e => { totals[e.category] += e.amount })
    setSpent(totals)
    setSettings(getSettings())
    setBalance(getBalance())
    setPace(getPace())
    setBillsPaidThisMonth(getPaymentsForMonth(currentYearMonth()).reduce((s, p) => s + p.amount, 0))
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
        {balance !== null && settings.balanceAnchor && (() => {
          // What you have — the number you typed in, minus everything logged since.
          const anchor = settings.balanceAnchor
          // What it costs to live at your actual pace: daily spending + fixed bills.
          const billsPerMonth = settings.bills.reduce((s, b) => s + b.amount, 0)
          const burnPerDay = pace.perDay + billsPerMonth / 30.44
          const monthsLeft = burnPerDay > 0 ? Math.max(balance / burnPerDay / 30.44, 0) : null
          const runsOut = burnPerDay > 0 && balance > 0 ? new Date(Date.now() + (balance / burnPerDay) * 86400000) : null
          // Where you'll land at the end of this month if nothing changes.
          const now = new Date()
          const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
          const daysRemaining = daysInMonth - now.getDate()
          const billsStillDue = Math.max(billsPerMonth - billsPaidThisMonth, 0)
          const endOfMonth = balance - pace.perDay * daysRemaining - billsStillDue
          const monthName = now.toLocaleDateString('en-US', { month: 'long' })
          const runwayColor = monthsLeft === null ? '#fff' : monthsLeft < 1 ? '#e74c3c' : monthsLeft < 2 ? '#f39c12' : '#2ecc71'
          return (
            <>
              {/* You have */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div style={label}>You have</div>
                <button onClick={onSettings} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, color: '#888' }}>
                  set {shortDate(anchor.ts)} · <span style={{ color: '#5dade2' }}>Update</span>
                </button>
              </div>
              <div style={{ fontSize: 40, fontWeight: 800, color: balance < 0 ? '#e74c3c' : '#fff', lineHeight: 1.1, marginBottom: 16 }}>
                {baht(balance)}
              </div>

              {/* At your pace */}
              <div style={{ background: '#252540', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <div style={label}>{pace.fromBudget ? 'At your budget' : 'At your pace'}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {baht(pace.perDay)}/day{billsPerMonth > 0 ? ` + ${baht(billsPerMonth)}/mo bills` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: runwayColor }}>
                  {monthsLeft === null
                    ? 'Nothing going out'
                    : balance <= 0
                      ? 'Already out'
                      : `Lasts ${monthsLeft.toFixed(1)} mo${runsOut ? ` · runs out around ${shortDate(runsOut.getTime())}` : ''}`}
                </div>
                <div style={{ fontSize: 13, color: '#bbb', marginTop: 4 }}>
                  End of {monthName}: <span style={{ fontWeight: 700, color: endOfMonth < 0 ? '#e74c3c' : '#fff' }}>{baht(endOfMonth)}</span>
                  {billsStillDue > 0 && <span style={{ color: '#777' }}> · {baht(billsStillDue)} bills still due</span>}
                </div>
                {pace.fromBudget && (
                  <div style={{ fontSize: 11, color: '#777', marginTop: 4 }}>Using your daily budget until there's a few days of spending to go on.</div>
                )}
              </div>
            </>
          )
        })()}

        {/* Today */}
        <div style={{ ...label, marginBottom: 6 }}>Today</div>
        <div style={{ display: 'flex', gap: 0 }}>
          {[['Budget', baht(totalBudget), '#fff'],
            ['Spent', baht(totalSpent), totalSpent > totalBudget ? '#e74c3c' : '#2ecc71'],
            ['To go', baht(totalLeft), totalLeft < 0 ? '#e74c3c' : '#2ecc71']
          ].map(([lbl, value, color], i) => (
            <div key={lbl} style={{ flex: 1, textAlign: 'center', borderRight: i < 2 ? '1px solid #333' : 'none' }}>
              <div style={label}>{lbl}</div>
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
      <div style={{ display: 'flex', gap: 10, padding: '0 12px 32px' }}>
        {[['Month', onMonth], ['Bills', onBills], ['History', onHistory], ['Settings', onSettings]].map(([label, fn]) => (
          <button
            key={label as string}
            onClick={fn as () => void}
            style={{ flex: 1, background: '#fff', border: 'none', borderRadius: 12, padding: '14px 0', fontWeight: 600, fontSize: 14, color: '#1a1a2e', boxShadow: '0 1px 4px rgba(0,0,0,0.07)' }}
          >
            {label as string}
          </button>
        ))}
      </div>
    </div>
  )
}
