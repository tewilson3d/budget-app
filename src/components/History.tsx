import { useState } from 'react'
import { CATEGORIES, CATEGORY_LABELS, CATEGORY_COLORS, Category } from '../types'
import { getEntries, deleteEntry, updateEntryCategory } from '../storage'

function fmt(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

type Props = { onBack: () => void }

export default function History({ onBack }: Props) {
  const [entries, setEntries] = useState(() => getEntries().slice().reverse())
  const [category, setCategory] = useState<'all' | Category>('all')
  const visibleEntries = category === 'all' ? entries : entries.filter(entry => entry.category === category)

  const remove = (id: string) => {
    if (!confirm('Delete this entry?')) return
    deleteEntry(id)
    setEntries(getEntries().slice().reverse())
  }

  const move = (id: string, nextCategory: Category) => {
    updateEntryCategory(id, nextCategory)
    setEntries(getEntries().slice().reverse())
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f4f8' }}>
      <div style={{ background: '#1a1a2e', padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ background: 'none', color: '#fff', fontSize: 22, padding: '4px 8px' }}>←</button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>History</span>
      </div>

      <div style={{ padding: '12px 12px 32px' }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 12 }}>
          <button
            onClick={() => setCategory('all')}
            style={{ ...filterButton, background: category === 'all' ? '#1a1a2e' : '#fff', color: category === 'all' ? '#fff' : '#555' }}
          >
            All
          </button>
          {CATEGORIES.map(item => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              style={{ ...filterButton, background: category === item ? CATEGORY_COLORS[item] : '#fff', color: category === item ? '#fff' : '#555' }}
            >
              {CATEGORY_LABELS[item]}
            </button>
          ))}
        </div>

        {visibleEntries.length === 0 && (
          <div style={{ textAlign: 'center', color: '#aaa', padding: 60 }}>
            {category === 'all' ? 'No entries yet' : `No ${CATEGORY_LABELS[category]} entries`}
          </div>
        )}
        {visibleEntries.map(e => (
          <div
            key={e.id}
            style={{ background: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 5, background: CATEGORY_COLORS[e.category], flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <select
                  aria-label={`Category for ${e.note || e.amount}`}
                  value={e.category}
                  onChange={event => move(e.id, event.target.value as Category)}
                  style={{ border: '1px solid #ddd', borderRadius: 7, background: '#fafafa', padding: '4px 6px', color: CATEGORY_COLORS[e.category], fontWeight: 700, fontSize: 13, minWidth: 0 }}
                >
                  {CATEGORIES.map(item => <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>)}
                </select>
                <span style={{ fontWeight: 800, fontSize: 16 }}>฿{e.amount.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                <span style={{ fontSize: 13, color: '#888' }}>{e.note ?? ''}</span>
                <span style={{ fontSize: 12, color: '#bbb' }}>{fmt(e.date)}</span>
              </div>
            </div>
            <button onClick={() => remove(e.id)} style={{ background: 'none', color: '#e74c3c', fontSize: 18, padding: '4px 8px' }}>×</button>
          </div>
        ))}
      </div>
    </div>
  )
}

const filterButton: React.CSSProperties = {
  border: 'none',
  borderRadius: 999,
  padding: '9px 14px',
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
}
