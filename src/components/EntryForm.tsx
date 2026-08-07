import { useState } from 'react'
import { Category, CATEGORIES, CATEGORY_LABELS, CATEGORY_COLORS } from '../types'
import { saveEntry } from '../storage'
import { todayStr } from '../dates'

const QUICK = [100, 200, 500, 1000, 1500, 2000]

type Props = { initialCategory: Category; onBack: () => void }

export default function EntryForm({ initialCategory, onBack }: Props) {
  const [cat, setCat] = useState<Category>(initialCategory)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const color = CATEGORY_COLORS[cat]

  const handleSave = () => {
    const num = parseFloat(amount)
    if (!num || num <= 0) return
    saveEntry({ id: `${Date.now()}-${Math.random()}`, date: todayStr(), category: cat, amount: num, note: note.trim() || undefined, ts: Date.now() })
    onBack()
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f4f8' }}>
      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{ background: 'none', color: '#fff', fontSize: 22, padding: '4px 8px' }}>←</button>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>Add Expense</span>
      </div>

      <div style={{ padding: 16 }}>
        {/* Category */}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 8 }}>Category</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {CATEGORIES.map(c => (
            <button
              key={c}
              onClick={() => setCat(c)}
              style={{
                border: `2px solid ${CATEGORY_COLORS[c]}`,
                borderRadius: 20,
                padding: '7px 14px',
                background: cat === c ? CATEGORY_COLORS[c] : '#fff',
                color: cat === c ? '#fff' : CATEGORY_COLORS[c],
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>

        {/* Amount */}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Amount (฿)</div>
        <div style={{ display: 'flex', alignItems: 'center', background: '#fff', borderRadius: 14, border: `2px solid ${color}`, padding: '0 16px', height: 64, marginBottom: 10 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color, marginRight: 4 }}>฿</span>
          <input
            autoFocus
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            style={{ flex: 1, border: 'none', fontSize: 36, fontWeight: 800, color: '#222', background: 'transparent' }}
          />
        </div>

        {/* Quick amounts */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {QUICK.map(q => (
            <button
              key={q}
              onClick={() => setAmount(String(q))}
              style={{ border: `1.5px solid ${color}`, borderRadius: 8, padding: '6px 12px', background: '#fff', color, fontWeight: 600, fontSize: 13 }}
            >
              ฿{q.toLocaleString()}
            </button>
          ))}
        </div>

        {/* Note */}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Note (optional)</div>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="e.g. lunch at market"
          style={{ width: '100%', background: '#fff', border: '1px solid #ddd', borderRadius: 12, padding: 14, fontSize: 15, color: '#333', marginBottom: 32 }}
        />

        <button
          onClick={handleSave}
          disabled={!amount || parseFloat(amount) <= 0}
          style={{
            width: '100%', background: color, color: '#fff', border: 'none',
            borderRadius: 14, padding: '16px 0', fontWeight: 800, fontSize: 17,
            opacity: (!amount || parseFloat(amount) <= 0) ? 0.5 : 1,
          }}
        >
          Save Expense
        </button>
      </div>
    </div>
  )
}
