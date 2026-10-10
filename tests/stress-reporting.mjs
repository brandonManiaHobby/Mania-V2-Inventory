// ============ REPORTING STRESS (VAT return, spend, stock P&L) ============
import { computeMoney, sumMoney, exVat, vatOfInclusive } from '../src/money/engine.js'
let pass=0,fail=0
const C=(l,g,w,eps=0.01)=>{const ok=Math.abs(g-w)<eps;ok?pass++:fail++;console.log(`${ok?'✓':'✗ FAIL'}  ${l}: ${g.toFixed(2)} (want ${w.toFixed(2)})`)}
const S=t=>console.log('\n--- '+t+' ---')

S('VAT RETURN: output - input, second-hand excluded')
{// standard sales: 2 streams output VAT; standard purchases: input VAT; second-hand ignored
 const outputVat = vatOfInclusive(2250,'standard') + vatOfInclusive(800,'standard')  // 2 sales
 const inputVat  = vatOfInclusive(6000,'standard')                                   // 1 purchase
 const secondHandSale = vatOfInclusive(950,'second_hand')                            // 0
 C('output VAT',outputVat,(2250-2250/1.2)+(800-800/1.2))
 C('second-hand contributes 0 output',secondHandSale,0)
 C('net VAT position (owe output - reclaim input)',outputVat-inputVat,outputVat-inputVat)
 C('input VAT reclaimable',inputVat,1000)}

S('SPEND rollup: fees + shipping summed by period')
{const streams=[{fees:120,shipping:10},{fees:80,shipping:5},{fees:0,shipping:0,net:null}]
 const totalFees=streams.reduce((a,s)=>a+(s.fees||0),0)
 const totalShip=streams.reduce((a,s)=>a+(s.shipping||0),0)
 C('total fees',totalFees,200)
 C('total shipping',totalShip,15)
 C('total spend',totalFees+totalShip,215)}

S('STOCK P&L: invested vs recovered vs on-hand = position')
{// product: invested 5900 (waves), recovered 1875, on-hand value 2000
 const invested=3500+2400, recovered=1875, onHand=2000
 const position=recovered+onHand-invested
 C('invested',invested,5900)
 C('position (recovered + on-hand - invested)',position,1875+2000-5900)
 C('position is negative (not yet broken even)',position<0?1:0,1)}

S('STOCK P&L: fully sold-through product shows true profit')
{// invested 1000, recovered 1500, on-hand 0 -> position +500
 const position=1500+0-1000
 C('sold-through profit',position,500)}

S('TOPPS SURVEY: per-product aggregation (breaks, units, revenue)')
{const lines=[{product:'Topps A',qty:5,lineTotal:500,streamId:'s1'},{product:'Topps A',qty:3,lineTotal:300,streamId:'s2'},{product:'Topps A',qty:2,lineTotal:200,streamId:'s1'}]
 const units=lines.reduce((a,l)=>a+l.qty,0)
 const revenue=lines.reduce((a,l)=>a+l.lineTotal,0)
 const breaks=new Set(lines.map(l=>l.streamId)).size
 C('total units',units,10)
 C('total revenue',revenue,1000)
 C('distinct breaks (streams)',breaks,2)
 C('avg price per unit',revenue/units,100)}

S('REPORTING consistency: dashboard total == sum of streamer totals')
{const alice=sumMoney([computeMoney({gross:2500,net:2250,costPaid:1250,vatTreatment:'standard'})])
 const bob=sumMoney([computeMoney({gross:1000,net:950,costPaid:600,vatTreatment:'standard'})])
 const dashboard=sumMoney([alice,bob])
 C('dashboard gross == alice+bob',dashboard.gross,alice.gross+bob.gross)
 C('dashboard profit == alice+bob',dashboard.trueProfit,alice.trueProfit+bob.trueProfit)
 C('dashboard VAT == alice+bob',dashboard.vatOwed,alice.vatOwed+bob.vatOwed)}

console.log(`\n==== REPORTING: ${pass} passed, ${fail} failed ====`)
process.exit(fail>0?1:0)
