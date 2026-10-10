import { scopeSource } from '../src/scoping/scope.js'
import { computeStream, computeMoney, sumMoney, exVat } from '../src/money/engine.js'

let pass=0, fail=0
const C=(l,g,w,eps=0.01)=>{const ok=Math.abs(g-w)<eps;ok?pass++:fail++;console.log(`${ok?'✓':'✗ FAIL'}  ${l}: got ${typeof g==='number'?g.toFixed(2):g}  want ${typeof w==='number'?w.toFixed(2):w}`)}
const CB=(l,g,w)=>{const ok=g===w;ok?pass++:fail++;console.log(`${ok?'✓':'✗ FAIL'}  ${l}: got ${g}  want ${w}`)}
const S=t=>console.log('\n========== '+t+' ==========')

// availableQty (copy of the pure fn — identical to writes.js)
function availableQty(source,{stockItemId,holderId,waveNo}){
  return source.holdings.filter(h=>h.stockItemId===stockItemId
    &&(holderId==='warehouse'?h.isWarehouse:h.holderId===holderId)
    &&(waveNo==null||h.waveNo===waveNo)).reduce((a,h)=>a+h.qty,0)
}
// validation guard (copy of restock's hard-block)
function canRestock(source,{stockItemId,qty}){
  const wh=availableQty(source,{stockItemId,holderId:'warehouse'})
  return qty<=wh
}

// -------------------------------------------------------------
// MOCK WORLD: 1 product, 2 waves in warehouse, 2 streamers, 2 depts
// -------------------------------------------------------------
const PROD='prodX'
let world = {
  stockItems:[{id:PROD,product:'Test Box',vatTreatment:'standard',archived:false}],
  waves:[
    {id:'w1',stockItemId:PROD,waveNo:1,qty:100,unitCost:50,totalCost:5000,revenueRecovered:0,paidOff:false},
    {id:'w2',stockItemId:PROD,waveNo:2,qty:100,unitCost:60,totalCost:6000,revenueRecovered:0,paidOff:false},
  ],
  holdings:[
    {id:'h-w1',stockItemId:PROD,holderId:null,isWarehouse:true,waveNo:1,qty:100,unitCost:50},
    {id:'h-w2',stockItemId:PROD,holderId:null,isWarehouse:true,waveNo:2,qty:100,unitCost:60},
  ],
  streams:[], streamLines:[],
  distroSales:[],
  profiles:[
    {id:'alice',name:'Alice',role:'breaker',department:'Pokemon'},
    {id:'bob',name:'Bob',role:'breaker',department:'Sports'},
    {id:'lee',name:'Lee',role:'channel_lead',department:'Pokemon'},
    {id:'mgr',name:'Mgr',role:'manager',department:null},
  ],
}
const vatOf=(id)=>world.stockItems.find(x=>x.id===id)?.vatTreatment==='second_hand'?'second_hand':'standard'

S('STEP 0 — starting state: 200 units in warehouse (2 waves)')
C('warehouse total', availableQty(world,{stockItemId:PROD,holderId:'warehouse'}), 200)
C('alice shelf (empty)', availableQty(world,{stockItemId:PROD,holderId:'alice'}), 0)

S('STEP 1 — RESTOCK 40 wave-1 units to Alice (the cycle begins)')
// guard check
CB('restock 40 allowed (<=200 wh)', canRestock(world,{stockItemId:PROD,qty:40}), true)
CB('restock 9999 BLOCKED (hard limit)', canRestock(world,{stockItemId:PROD,qty:9999}), false)
// simulate what record_checkout does: move 40 from warehouse wave1 -> Alice wave1
world.holdings.find(h=>h.id==='h-w1').qty -= 40
world.holdings.push({id:'h-a1',stockItemId:PROD,holderId:'alice',isWarehouse:false,waveNo:1,qty:40,unitCost:50})
C('warehouse now 160', availableQty(world,{stockItemId:PROD,holderId:'warehouse'}), 160)
C('alice now has 40', availableQty(world,{stockItemId:PROD,holderId:'alice'}), 40)
C('TOTAL conserved (still 200)', availableQty(world,{stockItemId:PROD,holderId:'warehouse'})+availableQty(world,{stockItemId:PROD,holderId:'alice'}), 200)

S('STEP 2 — Alice RECORDS A STREAM: sells 25 of her 40, gross 2500 net 2250 (Whatnot)')
// record_stream: insert stream + line, decrement Alice's holding, recover wave cost
const streamId='s1'
world.streams.push({id:streamId,streamerId:'alice',streamerName:'Alice',platform:'Whatnot',channel:'ManiaPop',streamDate:'2026-10-01',totalSales:2500,net:2250,shipping:0,profit:0})
world.streamLines.push({id:'l1',streamId,stockItemId:PROD,product:'Test Box',qty:25,unitCost:50,lineTotal:2500,brokered:false})
world.holdings.find(h=>h.id==='h-a1').qty -= 25            // Alice 40 -> 15
world.waves.find(w=>w.waveNo===1).revenueRecovered += exVat(2250) // recover net ex-VAT (Option C)
C('alice now 15 on shelf', availableQty(world,{stockItemId:PROD,holderId:'alice'}), 15)
C('TOTAL now 175 (25 sold/consumed)', availableQty(world,{stockItemId:PROD,holderId:'warehouse'})+availableQty(world,{stockItemId:PROD,holderId:'alice'}), 175)
// money ladder for the stream
const m1=computeStream({gross:2500,net:2250,shipping:0},[{qty:25,unitCost:50,lineTotal:2500,brokered:false,stockItemId:PROD}],vatOf)
C('stream fees', m1.fees, 250)
C('stream vatOwed', m1.vatOwed, 2250-2250/1.2)            // 375
C('stream trueProfit', m1.trueProfit, (2250/1.2)-(25*50/1.2)) // netExVat - costExVat

S('STEP 3 — recovery: wave 1 recovered net-ex-VAT of the sale')
C('wave1 recovered', world.waves.find(w=>w.waveNo===1).revenueRecovered, exVat(2250)) // 1875
const w1=world.waves.find(w=>w.waveNo===1)
const w1costExVat=exVat(w1.totalCost)
C('wave1 cost ex-VAT', w1costExVat, 5000/1.2)             // 4166.67
CB('wave1 NOT yet paid off (1875 < 4166)', exVat(2250) >= w1costExVat, false)

S('STEP 4 — SCOPING during the lifecycle: who sees Alice’s stream?')
CB('manager sees it', scopeSource(world,{id:'mgr',role:'manager',department:null}).streams.some(s=>s.id===streamId), true)
CB('Lee (Pokemon lead) sees it (Alice is Pokemon)', scopeSource(world,{id:'lee',role:'channel_lead',department:'Pokemon'}).streams.some(s=>s.id===streamId), true)
CB('Bob (other streamer) CANNOT see it', scopeSource(world,{id:'bob',role:'breaker',department:'Sports'}).streams.some(s=>s.id===streamId), false)
CB('Alice sees her own', scopeSource(world,{id:'alice',role:'breaker',department:'Pokemon'}).streams.some(s=>s.id===streamId), true)

S('STEP 5 — streamer performance derives correctly (Alice’s rollup)')
{
  const scoped=scopeSource(world,{id:'mgr',role:'manager',department:null})
  const aliceStreams=scoped.streams.filter(s=>s.streamerId==='alice')
  const ladders=aliceStreams.map(s=>{const ln=scoped.streamLines.filter(l=>l.streamId===s.id&&!l.brokered);return computeStream({gross:s.totalSales,net:s.net,shipping:s.shipping},ln.map(l=>({qty:l.qty,unitCost:l.unitCost,lineTotal:l.lineTotal,brokered:false,stockItemId:l.stockItemId})),vatOf)})
  const t=sumMoney(ladders)
  C('alice perf gross', t.gross, 2500)
  C('alice perf trueProfit', t.trueProfit, m1.trueProfit)
}

S('STEP 6 — DISTRO SALE from warehouse wave 2: 10 units @ £800')
const whW2Before=availableQty(world,{stockItemId:PROD,holderId:'warehouse',waveNo:2})
C('wave2 warehouse before', whW2Before, 100)
// guard
CB('distro 10 allowed', 10<=whW2Before, true)
CB('distro 999 BLOCKED', 999<=whW2Before, false)
// simulate record_distro_sale: decrement wave2 warehouse, record sale, recover
world.holdings.find(h=>h.id==='h-w2').qty -= 10
world.distroSales.push({id:'d1',stockItemId:PROD,product:'Test Box',waveNo:2,qty:10,revenue:800,cost:600,profit:200,soldOn:'2026-10-02'})
world.waves.find(w=>w.waveNo===2).revenueRecovered += exVat(800)
C('wave2 warehouse now 90', availableQty(world,{stockItemId:PROD,holderId:'warehouse',waveNo:2}), 90)
C('TOTAL now 165', availableQty(world,{stockItemId:PROD,holderId:'warehouse'})+availableQty(world,{stockItemId:PROD,holderId:'alice'}), 165)

S('STEP 7 — second-hand lifecycle: flag product, sell, VAT must be 0')
world.stockItems[0].vatTreatment='second_hand'
const m2=computeStream({gross:1000,net:950,shipping:0},[{qty:5,unitCost:60,lineTotal:1000,brokered:false,stockItemId:PROD}],vatOf)
C('second-hand stream VAT = 0', m2.vatOwed, 0)
C('second-hand profit = net - cost (no VAT strip)', m2.trueProfit, 950-(5*60))  // 650
world.stockItems[0].vatTreatment='standard' // reset

S('STEP 8 — EDIT the stream (atomic reverse+reapply): Alice sold 25->30, gross 2500->3000')
// simulate edit_stream: reverse old (restore 25, un-recover), apply new (consume 30, re-recover)
// reverse
world.holdings.find(h=>h.id==='h-a1').qty += 25           // back to 40
world.waves.find(w=>w.waveNo===1).revenueRecovered -= exVat(2250)
// reapply new (30 units, gross 3000 net 2700)
world.holdings.find(h=>h.id==='h-a1').qty -= 30           // 40 -> 10
world.streams.find(s=>s.id===streamId).totalSales=3000
world.streams.find(s=>s.id===streamId).net=2700
world.streamLines.find(l=>l.id==='l1').qty=30
world.streamLines.find(l=>l.id==='l1').lineTotal=3000
world.waves.find(w=>w.waveNo===1).revenueRecovered += exVat(2700)
C('alice shelf after edit (40-30=10)', availableQty(world,{stockItemId:PROD,holderId:'alice'}), 10)
C('wave1 recovered after edit', world.waves.find(w=>w.waveNo===1).revenueRecovered, exVat(2700)) // 2250

S('STEP 9 — DELETE the stream (restores stock, un-recovers)')
// simulate delete_stream: restore the 30 units, remove recovery, drop stream+line
world.holdings.find(h=>h.id==='h-a1').qty += 30           // 10 -> 40
world.waves.find(w=>w.waveNo===1).revenueRecovered -= exVat(2700)
world.streams=world.streams.filter(s=>s.id!==streamId)
world.streamLines=world.streamLines.filter(l=>l.streamId!==streamId)
C('alice shelf restored to 40', availableQty(world,{stockItemId:PROD,holderId:'alice'}), 40)
C('wave1 recovery back to 0', world.waves.find(w=>w.waveNo===1).revenueRecovered, 0)
CB('stream gone from list', world.streams.some(s=>s.id===streamId), false)
C('TOTAL conserved after full cycle (200 - 10 distro = 190)', availableQty(world,{stockItemId:PROD,holderId:'warehouse'})+availableQty(world,{stockItemId:PROD,holderId:'alice'}), 190)

console.log(`\n================  LIFECYCLE RESULT: ${pass} passed, ${fail} failed  ================`)
process.exit(fail>0?1:0)
