import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { colourFor } from '../colours'

const gbp = (n) => '£' + Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (n) => (Number(n || 0) * 100).toFixed(1) + '%'

const minutesBetween = (s, e) => {
  if (!s || !e) return 0
  const [sh, sm] = String(s).split(':').map(Number)
  const [eh, em] = String(e).split(':').map(Number)
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins < 0) mins += 24 * 60          // ran past midnight
  return mins
}

const ukDate = (d) =>
  d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '—'

/**
 * STREAM RECEIPT
 *
 * The whole show on one card: what ran, what it took, what it cost, what it
 * made per hour. Opens as a proper modal so it reads on a phone — the old
 * inline expansion sat inside a wide table and got clipped.
 */
export default function StreamReceipt({ stream, onClose, canDelete, onDelete, onEdit, onOpenProduct }) {
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('stream_lines')
      .select('product,stock_item_id,qty,unit_cost,line_total,line_kind,brokered')
      .eq('stream_id', stream.id)
      .then(({ data }) => { setLines(data || []); setLoading(false) })
    // line_kind distinguishes sold vs giveaway.
  }, [stream.id])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const hours = minutesBetween(stream.stream_start, stream.stream_end) / 60
  const revenue = Number(stream.revenue || 0)
  const brokeredSales = Number(stream.brokered_sales || 0)
  const brokeredCost = Number(stream.brokered_cost || 0)
  const profit = Number(stream.profit || 0)
  const cost = revenue - profit
  const rph = hours > 0 ? revenue / hours : 0
  const margin = revenue > 0 ? profit / revenue : 0
  // Brokered belongs to the channel, so the streamer's own figures strip it and
  // its cost out. When there's brokered on the stream, the cards lead with these
  // and show the channel figure underneath; otherwise they read as before.
  const hasBrokered = brokeredSales > 0 || brokeredCost > 0
  const ownRevenue = revenue - brokeredSales
  const ownCost = cost - brokeredCost
  const ownProfit = ownRevenue - ownCost
  const ownRph = hours > 0 ? ownRevenue / hours : 0
  const ownMargin = ownRevenue > 0 ? ownProfit / ownRevenue : 0
  const away = !!stream.is_away

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal receipt" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-head">
          <span className="receipt-dot" style={{ background: colourFor('department', stream.department) }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 17 }}>{stream.title || 'Untitled stream'}</h3>
            <div className="note">{ukDate(stream.stream_date)}</div>
          </div>
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>

        <div className="receipt-meta">
          <div><span className="label">CHANNEL</span><strong>{stream.channel || '—'}</strong></div>
          <div><span className="label">PLATFORM</span><strong>{stream.platform || '—'}</strong></div>
          <div><span className="label">STREAMER</span><strong>{stream.streamer_name || '—'}</strong></div>
          <div><span className="label">TYPE</span><strong>{stream.stream_type || '—'}</strong></div>
          <div>
            <span className="label">TIME</span>
            <strong>
              {stream.stream_start?.slice(0, 5) || '—'} – {stream.stream_end?.slice(0, 5) || '—'}
              <span className="note"> · {hours.toFixed(1)} hrs</span>
            </strong>
          </div>
        </div>

        {away ? (
          /* An away stream: hours are ours, the money isn't. Don't show zeros —
             a zero implies the show made nothing, which is a lie. */
          <div className="receipt-away">
            <strong>Away stream</strong>
            <p className="note" style={{ margin: '4px 0 0' }}>
              This ran on <strong>{stream.department}</strong>&rsquo;s channel, so the revenue and product
              detail belong to them. The <strong>{hours.toFixed(1)} hours</strong> still count towards
              this streamer.
            </p>
          </div>
        ) : (
          <>
            <div className="receipt-figures">
              <div>
                <span className="label">{hasBrokered ? 'STREAMER’S SALES' : 'REVENUE'}</span>
                <span className="fig">{gbp(hasBrokered ? ownRevenue : revenue)}</span>
                {hasBrokered && <span className="note">channel {gbp(revenue)} · {gbp(brokeredSales)} brokered</span>}
              </div>
              <div>
                <span className="label">STOCK COST</span>
                <span className="fig">{gbp(hasBrokered ? ownCost : cost)}</span>
                {hasBrokered && <span className="note">channel {gbp(cost)}</span>}
              </div>
              <div>
                <span className="label">PROFIT</span>
                <span className="fig" style={{ color: (hasBrokered ? ownProfit : profit) >= 0 ? 'var(--good)' : 'var(--red)' }}>
                  {gbp(hasBrokered ? ownProfit : profit)}
                </span>
                <span className="note">{pct(hasBrokered ? ownMargin : margin)} margin{hasBrokered ? ` · channel ${gbp(profit)}` : ''}</span>
              </div>
              <div>
                <span className="label">REVENUE / HOUR</span>
                <span className="fig">{hours > 0 ? gbp(hasBrokered ? ownRph : rph) : '—'}</span>
                <span className="note">{hasBrokered ? `channel ${gbp(rph)}` : `over ${hours.toFixed(1)} hrs`}</span>
              </div>
            </div>
            {hasBrokered && (
              <p className="note" style={{ margin: '2px 0 0' }}>
                Brokered deals are excluded from the streamer’s figures — the channel still counts every penny.
              </p>
            )}

            <div className="label" style={{ fontWeight: 700, margin: '4px 0 6px' }}>WHAT RAN</div>
            {loading ? (
              <p className="note">Loading…</p>
            ) : lines.filter((l) => l.line_kind !== 'giveaway').length === 0 ? (
              <p className="note">No product lines recorded for this stream.</p>
            ) : (
              <div className="receipt-lines">
                {lines.filter((l) => l.line_kind !== 'giveaway').map((l, i) => {
                  const lineCost = Number(l.qty || 0) * Number(l.unit_cost || 0)
                  const lineProfit = Number(l.line_total || 0) - lineCost
                  const lineMargin = Number(l.line_total || 0) > 0 ? lineProfit / Number(l.line_total) : 0
                  return (
                    <div className="receipt-line" key={i}>
                      <div className="rl-name">
                        {onOpenProduct && l.stock_item_id
                          ? <button className="btn-link" style={{ color: 'var(--ink)', textDecoration: 'underline', textDecorationStyle: 'dotted', cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit' }}
                              onClick={() => onOpenProduct({ id: l.stock_item_id, product: l.product })} title="See this product's overview">{l.product}</button>
                          : l.product}
                        <span className="note"> · {l.qty} @ {gbp(l.unit_cost)}</span>
                        {l.brokered && <span className="pill" style={{ marginLeft: 6 }}>brokered</span>}
                      </div>
                      <div className="rl-figs">
                        <span>{gbp(l.line_total)}</span>
                        <span style={{ color: lineProfit >= 0 ? 'var(--good)' : 'var(--red)' }}>
                          {gbp(lineProfit)}
                        </span>
                        <span className="note">{pct(lineMargin)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {lines.some((l) => l.line_kind === 'giveaway') && (
              <>
                <div className="label" style={{ fontWeight: 700, margin: '14px 0 6px' }}>GIVEAWAYS</div>
                <div className="receipt-lines">
                  {lines.filter((l) => l.line_kind === 'giveaway').map((l, i) => {
                    const spend = Number(l.qty || 0) * Number(l.unit_cost || 0)
                    return (
                      <div className="receipt-line" key={'g' + i}>
                        <div className="rl-name">
                          {l.product}
                          <span className="note"> · {l.qty} @ {gbp(l.unit_cost)}</span>
                        </div>
                        <div className="rl-figs">
                          <span style={{ color: 'var(--red)' }}>−{gbp(spend)}</span>
                          <span className="note">deducted</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="note" style={{ marginTop: 6 }}>
                  Giveaway spend comes off profit — no revenue, cost only.
                </p>
              </>
            )}

            {(Number(stream.singles_revenue || 0) > 0 || Number(stream.singles_cost || 0) > 0) && (
              <>
                <div className="receipt-line-head" style={{ marginTop: 12 }}>Singles</div>
                <div className="receipt-line">
                  <span>{Number(stream.singles_qty || 0) || ''} singles</span>
                  <span>
                    {gbp(Number(stream.singles_revenue || 0))}
                    <span className="note"> · cost {gbp(Number(stream.singles_cost || 0))} · profit {gbp(Number(stream.singles_revenue || 0) - Number(stream.singles_cost || 0))}</span>
                  </span>
                </div>
                <p className="note" style={{ marginTop: 6 }}>
                  Singles are their own line — counted in the stream total, kept separate from card products.
                </p>
              </>
            )}

            {stream.has_estimated_sales && (
              <p className="note" style={{ marginTop: 8 }}>
                Sales weren&rsquo;t attributed per product on this show, so the split above is
                <strong> estimated</strong> — weighted by each product&rsquo;s stock cost.
              </p>
            )}
          </>
        )}
        {canDelete && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span className="note">Something wrong? Edit corrects the details; deleting returns the stock and wipes it from all figures.</span>
            <span style={{ display: 'flex', gap: 8, flex: '0 0 auto' }}>
              {onEdit && (
                <button
                  className="btn ghost sm"
                  onClick={onEdit}
                  title="Correct the details of this stream"
                >Edit stream</button>
              )}
              <button
                className="btn ghost sm"
                style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                onClick={onDelete}
                title="Delete this stream and return its stock to the streamer"
              >Delete stream</button>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
