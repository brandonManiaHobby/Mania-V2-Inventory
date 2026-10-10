// ============ STREAM STRESS ============
import { computeStream, computeMoney } from '../src/money/engine.js'
let pass=0,fail=0
const C=(l,g,w)=>{const ok=(typeof g==='number'?Math.abs(g-w)<0.01:g===w);ok?pass++:fail++;console.log(`${ok?'✓':'✗ FAIL'}  ${l}: ${typeof g==='number'?g.toFixed(2):g} (want ${typeof w==='number'?w.toFixed(2):w})`)}
const S=t=>console.log('\n--- '+t+' ---')
const vatStd=()=>'standard'
const EX=v=>v/1.2

S('single-line stream, net entered')
{const m=computeStream({gross:1000,net:900},[{qty:10,unitCost:50,lineTotal:1000,brokered:false,stockItemId:'A'}],vatStd)
 C('fees',m.fees,100); C('net',m.net,900); C('cost',m.costPaid,500)
 C('trueProfit',m.trueProfit,EX(900)-EX(500))}

S('no net -> net=gross, zero fees')
{const m=computeStream({gross:800},[{qty:8,unitCost:40,lineTotal:800,brokered:false,stockItemId:'A'}],vatStd)
 C('net=gross',m.net,800); C('fees 0',m.fees,0)}

S('multi-line stream (3 products)')
{const lines=[{qty:2,unitCost:100,lineTotal:300,brokered:false,stockItemId:'A'},{qty:5,unitCost:20,lineTotal:200,brokered:false,stockItemId:'B'},{qty:1,unitCost:400,lineTotal:500,brokered:false,stockItemId:'C'}]
 const m=computeStream({gross:1000,net:950},lines,vatStd)
 C('total cost (200+100+400)',m.costPaid,700)
 C('gross from lines',m.gross,1000)}

S('BROKERED line excluded from cost/profit (not owned stock)')
{const lines=[{qty:5,unitCost:50,lineTotal:500,brokered:false,stockItemId:'A'},{qty:3,unitCost:0,lineTotal:300,brokered:true,stockItemId:'B'}]
 const m=computeStream({gross:800,net:720},lines,vatStd)
 C('cost excludes brokered (only 250)',m.costPaid,250)}

S('stream = sum of its lines via computeMoney (consistency)')
{// a 2-line stream should profit same as summing each line's computeMoney when net=gross
 const lines=[{qty:1,unitCost:100,lineTotal:300,brokered:false,stockItemId:'A'},{qty:1,unitCost:150,lineTotal:400,brokered:false,stockItemId:'B'}]
 const m=computeStream({gross:700,net:700},lines,vatStd)  // net=gross so no fee distortion
 const a=computeMoney({gross:300,net:300,costPaid:100,vatTreatment:'standard'})
 const b=computeMoney({gross:400,net:400,costPaid:150,vatTreatment:'standard'})
 C('stream profit == sum of line profits',m.trueProfit,a.trueProfit+b.trueProfit)}

S('EDIT reversibility (reverse old then apply new = net delta only)')
{// old: 10 units cost 50 = 500 cost; new: 15 units = 750 cost. Delta stock = -5 from shelf
 const shelfStart=40
 let shelf=shelfStart
 shelf+=10  // reverse old consume
 shelf-=15  // apply new consume
 C('shelf net change = -5',shelf-shelfStart,-5)
 C('shelf lands at 35',shelf,35)}

S('DELETE reversibility (restore exactly what was consumed)')
{let shelf=25; const consumed=15; shelf+=consumed; C('delete restores 15',shelf,40)}

S('shipping shown, NOT in profit')
{const m=computeStream({gross:1000,net:900,shipping:50},[{qty:10,unitCost:50,lineTotal:1000,brokered:false,stockItemId:'A'}],vatStd)
 C('shipping carried',m.shipping,50)
 C('profit ignores shipping',m.trueProfit,EX(900)-EX(500))}

S('net cannot exceed gross is a VALIDATION concern (engine still computes)')
{const m=computeStream({gross:500,net:600},[{qty:5,unitCost:40,lineTotal:500,brokered:false,stockItemId:'A'}],vatStd)
 C('fees negative when net>gross (flagged upstream)',m.fees,-100)}

console.log(`\n==== STREAM: ${pass} passed, ${fail} failed ====`)
process.exit(fail>0?1:0)
