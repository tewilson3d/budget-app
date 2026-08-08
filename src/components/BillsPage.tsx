import { useState } from 'react'
import { Bill, Settings } from '../types'
import { getSettings, saveSettings, getPaymentsForMonth, toggleBillPaid } from '../storage'
import { currentYearMonth } from '../dates'

type Props = { onBack: () => void }

export default function BillsPage({ onBack }: Props) {
  const month = currentYearMonth()
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const [settings, setSettings] = useState<Settings>(getSettings)
  const [paidIds, setPaidIds] = useState<Set<string>>(() => new Set(getPaymentsForMonth(month).map(p => p.billId)))
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<{ id: string; name: string; amount: string }[]>([])

  const bills = settings.bills
  const totalDue = bills.reduce((s, b) => s + b.amount, 0)
  const totalPaid = bills.filter(b => paidIds.has(b.id)).reduce((s, b) => s + b.amount, 0)

  const toggle = (bill: Bill) => {
    const paid = toggleBillPaid(bill, month)
    setPaidIds(prev => {
      const next = new Set(prev)
      if (paid) next.add(bill.id); else next.delete(bill.id)
      return next
    })
  }

  const startEditing = () => {
    setDrafts(bills.map(b => ({ id: b.id, name: b.name, amount: String(b.amount) })))
    setEditing(true)
  }

  const finishEditing = () => {
    const cleaned: Bill[] = drafts
      .filter(d => d.name.trim())
      .map(d => ({ id: d.id, name: d.name.trim(), amount: parseFloat(d.amount) || 0 }))
    const updated: Settings = { ...getSettings(), bills: cleaned }
    saveSettings(updated)
    setSettings(updated)
    setEditing(false)
  }

  const addDraft = () => {
    setDrafts(prev => [...prev, { id: `bill-${Date.now()}`, name: '', amount: '' }])
  }

  return (
    <div style={{ minHeight: '100dvh', background: '#f0f4f8' }}>
      {/* Header */}
      <div style={{ background: '#1a1a2e', padding: '16px 16px 20px', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: 'none', color: '#fff', fontSize: 22, padding: '4px 8px' }}>←</button>
          <span style={{ fontWeight: 700, fontSize: 18 }}>Monthly Bills</span>
          <span style={{ fontSize: 12, color: '#888', marginLeft: 'auto' }}>{monthName}</span>
        </div>
        <div style={{ display: 'flex', gap: 0 }}>
          {[['Due', `฿${totalDue.toLocaleString()}`, '#fff'],
            ['Paid', `฿${totalPaid.toLocaleString()}`, '#2ecc71'],
            ['Left', `฿${(totalDue - totalPaid).toLocaleString()}`, totalDue - totalPaid > 0 ? '#f39c12' : '#2ecc71']
          ].map(([label, value, color], i) => (
            <div key={label} style={{ flex: 1, textAlign: 'center', borderRight: i < 2 ? '1px solid #333' : 'none' }}>
              <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: color as string, marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '12px 12px 32px' }}>
        {!editing && (
          <p style={{ fontSize: 13, color: '#888', margin: '4px 2px 12px' }}>
            Tap a bill when you pay it. Paid bills come out of your wallet balance.
          </p>
        )}

        {!editing && bills.map(bill => {
          const paid = paidIds.has(bill.id)
          return (
            <button
              key={bill.id}
              onClick={() => toggle(bill)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                background: paid ? '#eafaf1' : '#fff', border: 'none', borderRadius: 12,
                padding: 14, marginBottom: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: 12, flexShrink: 0,
                border: paid ? 'none' : '2px solid #ccc',
                background: paid ? '#27ae60' : 'transparent',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800,
              }}>
                {paid ? '✓' : ''}
              </div>
              <span style={{
                flex: 1, fontWeight: 600, fontSize: 15,
                color: paid ? '#27ae60' : '#222',
                textDecoration: paid ? 'line-through' : 'none',
              }}>
                {bill.name}
              </span>
              <span style={{ fontWeight: 800, fontSize: 16, color: paid ? '#27ae60' : '#222' }}>
                ฿{bill.amount.toLocaleString()}
              </span>
            </button>
          )
        })}

        {editing && drafts.map((d, i) => (
          <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff', borderRadius: 12, padding: 10, marginBottom: 8 }}>
            <input
              type="text"
              value={d.name}
              placeholder="Bill name"
              onChange={e => setDrafts(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              style={{ flex: 1, border: '1px solid #ddd', borderRadius: 8, padding: '10px 12px', fontSize: 15, minWidth: 0 }}
            />
            <input
              type="number"
              value={d.amount}
              placeholder="฿"
              onChange={e => setDrafts(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
              style={{ width: 90, textAlign: 'right', border: '1px solid #ddd', borderRadius: 8, padding: '10px 12px', fontSize: 15 }}
            />
            <button
              onClick={() => setDrafts(prev => prev.filter((_, j) => j !== i))}
              style={{ background: 'none', color: '#e74c3c', fontSize: 20, padding: '4px 6px', border: 'none' }}
            >
              ×
            </button>
          </div>
        ))}

        {editing && (
          <button onClick={addDraft} style={{ ...actionBtn, background: '#fff', color: '#1a1a2e', border: '2px dashed #bbb' }}>
            + Add Bill
          </button>
        )}

        <button
          onClick={editing ? finishEditing : startEditing}
          style={{ ...actionBtn, background: editing ? '#27ae60' : '#1a1a2e', color: '#fff', marginTop: 8 }}
        >
          {editing ? 'Done' : 'Edit Bills'}
        </button>
      </div>
    </div>
  )
}

const actionBtn: React.CSSProperties = {
  display: 'block', width: '100%',
  padding: '14px 0', borderRadius: 12,
  fontWeight: 700, fontSize: 15, border: 'none',
}
