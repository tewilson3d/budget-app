import { useState } from 'react'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../types'
import { getEntries, deleteEntry } from '../storage'

function fmt(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

type Props = { onBack: () => void }

export default function History({ onBack }: Props) {
  const [entries, setEntries] = useState(() => getEntries().slice().reverse())

  const remove = (id: string) => {
    if (!confirm('Delete this entry?')) return
    deleteEntry(id)
    setEntries(getEntries().slice().reverse())
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f4f8' }}>
      <div style={{ background: '#1a1a2e', padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ background: 'none', color: '#fff', fontSize: 22, padding: '4px 8px' }}>←</button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>History</span>
      </div>

      <div style={{ padding: '12px 12px 32px' }}>
        {entries.length === 0 && (
          <div style={{ textAlign: 'center', color: '#aaa', padding: 60 }}>No entries yet</div>
        )}
        {entries.map(e => (
          <div
            key={e.id}
            style={{ background: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 5, background: CATEGORY_COLORS[e.category], flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{CATEGORY_LABELS[e.category]}</span>
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
