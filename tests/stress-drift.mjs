// ============ DRIFT / PRECISION PROPERTY STRESS ============
// Proves the core V2 promise: full precision throughout, round ONLY at the
// edge. If the engine rounded internally (per-line, per-ladder) the sums
// below would drift by pennies. These assert the engine does NOT.
import { computeMoney, sumMoney, exVat, vatOfInclusive } from '../src/money/engine.js'
let pass=0,fail=0
const C=(l,g,w,eps=1e-9)=>{const ok=Math.abs(g-w)<eps;ok?pass++:fail++;console.log(`${ok?'✓':'✗ FAIL'}  ${l}: ${g} (want ${w})`)}
const CT=(l,cond)=>{cond?pass++:fail++;console.log(`${cond?'✓':'✗ FAIL'}  ${l}`)}
const S=t=>console.log('\n--- '+t+' ---')

S('VAT strip is an exact identity (no lost pennies)')
for (const x of [120, 0.10, 0.07, 99.99, 12345.67, 1e6]) {
  C(`exVat(${x}) + vatOfInclusive(${x}) === ${x}`, exVat(x)+vatOfInclusive(x), x)
  C(`exVat(${x}) * 1.2 round-trips`, exVat(x)*1.2, x, 1e-7)
}
C('second-hand: exVat passes through', exVat(120,'second_hand'), 120)
C('second-hand: no VAT', vatOfInclusive(120,'second_hand'), 0)

S('no per-item rounding: 3x {net 10} VAT sums to exactly 5.00')
// Each VAT = 1.6666..; rounded-each-to-penny would give 5.01. Full precision = 5.00.
{const l=computeMoney({gross:10,net:10,costPaid:0,vatTreatment:'standard'})
 const t=sumMoney([l,l,l])
 C('sum vatPortion == 5.00 (not 5.01)', t.vatPortion, 5.00, 1e-9)}

S('no per-item rounding: 7x {net 0.07} keeps sub-penny precision')
{const l=computeMoney({gross:0.07,net:0.07,costPaid:0,vatTreatment:'standard'})
 const t=sumMoney(Array(7).fill(l))
 const want=7*(0.07-0.07/1.2)
 C('sum vatPortion keeps precision', t.vatPortion, want, 1e-9)
 CT('would-be rounded-each sum (0.07) is detectably wrong', Math.abs(t.vatPortion-0.07)>0.005)}

S('margins recomputed from totals, NEVER averaged')
{const a=computeMoney({gross:100, net:100, costPaid:0,  vatTreatment:'standard'})  // 83% margin
 const b=computeMoney({gross:1000,net:1000,costPaid:900,vatTreatment:'standard'}) // 8.3% margin
 const t=sumMoney([a,b])
 C('net margin = totalProfit/totalGross', t.netMarginPct, t.trueProfit/t.gross, 1e-12)
 CT('NOT the mean of the two margins (~0.458)', Math.abs(t.netMarginPct-0.4583)>0.1)}

S('order independence: 1000 awkward ladders sum the same in any order')
{const L=[]
 for (let i=1;i<=1000;i++){
   const g=(i*7.77)%333+0.01, n=g*(0.8+(i%13)/100), c=(i*3.33)%120
   L.push(computeMoney({gross:g,net:n,costPaid:c,vatTreatment:(i%4===0?'second_hand':'standard')}))
 }
 const fwd=sumMoney(L).trueProfit
 const rev=sumMoney([...L].reverse()).trueProfit
 const shuf=sumMoney([...L].sort(()=>0.5-((Math.sin(fwd)+1)/2))).trueProfit
 C('forward == reverse', fwd, rev, 1e-6)
 C('forward == shuffled', fwd, shuf, 1e-6)
 // independent full-precision accumulation (different code path)
 let gEx=0,cEx=0
 for (let i=1;i<=1000;i++){
   const g=(i*7.77)%333+0.01, n=g*(0.8+(i%13)/100), c=(i*3.33)%120
   const sh=i%4===0
   gEx += sh? n : n/1.2
   cEx += sh? c : c/1.2
 }
 C('sumMoney trueProfit == independent (netExVat-costExVat)', fwd, gEx-cEx, 1e-6)}

console.log(`\n==== DRIFT: ${pass} passed, ${fail} failed ====`)
process.exit(fail>0?1:0)
