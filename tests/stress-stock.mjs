// ============ STOCK STRESS ============
let pass=0,fail=0
const C=(l,g,w)=>{const ok=(typeof g==='number'?Math.abs(g-w)<0.01:g===w);ok?pass++:fail++;console.log(`${ok?'✓':'✗ FAIL'}  ${l}: ${g} (want ${w})`)}
const S=t=>console.log('\n--- '+t+' ---')

function availableQty(source,{stockItemId,holderId,waveNo}){
  return source.holdings.filter(h=>h.stockItemId===stockItemId
    &&(holderId==='warehouse'?h.isWarehouse:h.holderId===holderId)
    &&(waveNo==null||h.waveNo===waveNo)).reduce((a,h)=>a+h.qty,0)
}

const P='p'
const world={holdings:[
  {id:'w1',stockItemId:P,holderId:null,isWarehouse:true,waveNo:1,qty:60,unitCost:50},
  {id:'w2',stockItemId:P,holderId:null,isWarehouse:true,waveNo:2,qty:40,unitCost:60},
  {id:'a1',stockItemId:P,holderId:'alice',isWarehouse:false,waveNo:1,qty:10,unitCost:50},
  {id:'z',stockItemId:'other',holderId:null,isWarehouse:true,waveNo:1,qty:5,unitCost:1},
],waves:[
  {id:'W1',stockItemId:P,waveNo:1,qty:70,unitCost:50,totalCost:3500,revenueRecovered:0,paidOff:false},
  {id:'W2',stockItemId:P,waveNo:2,qty:40,unitCost:60,totalCost:2400,revenueRecovered:0,paidOff:false},
],streamLines:[{stockItemId:P,qty:15,brokered:false}],distroSales:[{stockItemId:P,qty:5}]}

S('null-warehouse matching (the distro decrement bug)')
C('warehouse total (60+40, NOT alice 10)', availableQty(world,{stockItemId:P,holderId:'warehouse'}), 100)
C('warehouse wave1 only (60)', availableQty(world,{stockItemId:P,holderId:'warehouse',waveNo:1}), 60)
C('warehouse wave2 only (40)', availableQty(world,{stockItemId:P,holderId:'warehouse',waveNo:2}), 40)
C('alice holding (10, not warehouse)', availableQty(world,{stockItemId:P,holderId:'alice'}), 10)
C('other product isolated (not counted)', availableQty(world,{stockItemId:P,holderId:'warehouse'}), 100)

S('hard-block guards (cannot over-move)')
const whTotal=availableQty(world,{stockItemId:P,holderId:'warehouse'})
C('restock 100 ok (==wh)', 100<=whTotal, true)
C('restock 101 BLOCKED', 101<=whTotal, false)
C('distro from wave2: 40 ok', 40<=availableQty(world,{stockItemId:P,holderId:'warehouse',waveNo:2}), true)
C('distro from wave2: 41 BLOCKED', 41<=availableQty(world,{stockItemId:P,holderId:'warehouse',waveNo:2}), false)
C('return from alice: 10 ok', 10<=availableQty(world,{stockItemId:P,holderId:'alice'}), true)
C('return from alice: 11 BLOCKED', 11<=availableQty(world,{stockItemId:P,holderId:'alice'}), false)

S('stock conservation through a transfer')
// move 20 wave1 wh->alice
const before=availableQty(world,{stockItemId:P,holderId:'warehouse'})+availableQty(world,{stockItemId:P,holderId:'alice'})
world.holdings.find(h=>h.id==='w1').qty-=20
world.holdings.find(h=>h.id==='a1').qty+=20
const after=availableQty(world,{stockItemId:P,holderId:'warehouse'})+availableQty(world,{stockItemId:P,holderId:'alice'})
C('total conserved on transfer', after, before)
C('warehouse dropped 20', availableQty(world,{stockItemId:P,holderId:'warehouse'}), 80)
C('alice gained 20', availableQty(world,{stockItemId:P,holderId:'alice'}), 30)

S('oversold detection (sold > received)')
const received=world.waves.filter(w=>w.stockItemId===P).reduce((a,w)=>a+w.qty,0)
const sold=world.streamLines.filter(l=>l.stockItemId===P&&!l.brokered).reduce((a,l)=>a+l.qty,0)+world.distroSales.filter(d=>d.stockItemId===P).reduce((a,d)=>a+d.qty,0)
C('received 110', received, 110)
C('sold 20 (15 stream + 5 distro)', sold, 20)
C('NOT oversold (received > sold)', sold>received, false)
// now force oversold: received must be BELOW sold(20). Set waves to 5+10=15 < 20
world.waves.find(w=>w.waveNo===1).qty=5
world.waves.find(w=>w.waveNo===2).qty=10
const received2=world.waves.filter(w=>w.stockItemId===P).reduce((a,w)=>a+w.qty,0)
C('received now 15 (below sold 20)', received2, 15)
C('oversold detected (20 sold > 15 received)', sold>received2, true)
C('oversold by 5', sold-received2, 5)

console.log(`\n==== STOCK: ${pass} passed, ${fail} failed ====`)
process.exit(fail>0?1:0)
