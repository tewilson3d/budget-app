import { CATEGORIES, CATEGORY_LABELS, CATEGORY_COLORS, Category } from '../types'
import { getEntriesForMonth, getSettings } from '../storage'
import { currentYearMonth } from '../dates'

type Props = { onBack: () => void }

export default function MonthPage({ onBack }: Props) {
  const now = new Date()
  const yearMonth = currentYearMonth()
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const settings = getSettings()
  const entries = getEntriesForMonth(yearMonth)
  const spent: Record<Category, number> = { food: 0, groceries: 0, dogs: 0, miscellaneous: 0 }
  entries.forEach(e => { spent[e.category] += e.amount })

  const totalTarget = CATEGORIES.reduce((s, c) => s + settings.dailyBudgets[c] * daysInMonth, 0)
  const totalSpent = CATEGORIES.reduce((s, c) => s + spent[c], 0)
  const totalPace = CATEGORIES.reduce((s, c) => s + settings.dailyBudgets[c] * dayOfMonth, 0)
  const paceDiff = totalPace - totalSpent

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f4f8' }}>
      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '16px 16px 20px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: 'none', color: '#fff', fontSize: 22, padding: '4px 8px' }}>←</button>
          <span style={{ fontWeight: 700, fontSize: 18 }}>{monthName}</span>
          <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>Day {dayOfMonth} of {daysInMonth}</span>
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {[['Budget', `฿${totalTarget.toLocaleString()}`, '#fff'],
            ['Spent', `฿${totalSpent.toLocaleString()}`, totalSpent > totalTarget ? '#e74c3c' : '#2ecc71'],
            ['Left', `฿${(totalTarget - totalSpent).toLocaleString()}`, totalTarget - totalSpent < 0 ? '#e74c3c' : '#2ecc71']
          ].map(([label, value, color], i) => (
            <div key={label} style={{ flex: 1, textAlign: 'center', borderRight: i < 2 ? '1px solid #333' : 'none' }}>
              <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: color as string, marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: paceDiff >= 0 ? '#2ecc71' : '#e74c3c' }}>
          {paceDiff >= 0
            ? `฿${paceDiff.toLocaleString()} under pace for day ${dayOfMonth}`
            : `฿${(-paceDiff).toLocaleString()} over pace for day ${dayOfMonth}`}
        </div>
      </div>

      {/* Per-category month cards */}
      <div style={{ padding: '12px 12px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CATEGORIES.map(cat => {
          const daily = settings.dailyBudgets[cat]
          const target = daily * daysInMonth
          const pace = daily * dayOfMonth
          const amount = spent[cat]
          const diff = pace - amount
          const over = amount > target
          const pct = target > 0 ? Math.min(amount / target, 1) : 0
          const pacePct = target > 0 ? Math.min(pace / target, 1) : 0
          const color = CATEGORY_COLORS[cat]

          return (
            <div key={cat} style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
              <div style={{ height: 4, background: color }} />
              <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{CATEGORY_LABELS[cat]}</span>
                  <span style={{ fontSize: 12, color: '#888' }}>฿{daily.toLocaleString()}/day</span>
                </div>

                {/* Progress bar with pace marker */}
                <div style={{ position: 'relative', height: 6, background: '#eee', borderRadius: 3, marginBottom: 12 }}>
                  <div style={{ height: '100%', width: `${pct * 100}%`, background: over ? '#e74c3c' : color, borderRadius: 3, transition: 'width 0.3s' }} />
                  <div style={{ position: 'absolute', top: -3, bottom: -3, left: `${pacePct * 100}%`, width: 2, background: '#1a1a2e', borderRadius: 1 }} title="pace" />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>Spent</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: over ? '#e74c3c' : '#222' }}>฿{amount.toLocaleString()}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>Month budget</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#555' }}>฿{target.toLocaleString()}</div>
                  </div>
                </div>

                <div style={{ fontSize: 13, color: diff >= 0 ? '#888' : '#e74c3c' }}>
                  {diff >= 0
                    ? `฿${diff.toLocaleString()} under pace (expected ฿${pace.toLocaleString()} by today)`
                    : `฿${(-diff).toLocaleString()} over pace (expected ฿${pace.toLocaleString()} by today)`}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
