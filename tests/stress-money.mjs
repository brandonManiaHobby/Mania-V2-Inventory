// ============ MONEY STRESS (deep edge cases) ============
import { computeMoney, sumMoney, exVat, vatOfInclusive } from '../src/money/engine.js'
let pass=0,fail=0
const C=(l,g,w,eps=0.01)=>{const ok=Math.abs(g-w)<eps;ok?pass++:fail++;console.log(`${ok?'✓':'✗ FAIL'}  ${l}: ${g.toFixed(4)} (want ${w.toFixed(4)})`)}
const S=t=>console.log('\n--- '+t+' ---')
const EX=v=>v/1.2, VAT=v=>v-v/1.2

S('VAT reclaim correctness (input VAT on purchase)')
C('input VAT on £6000 cost', VAT(6000), 6000-5000)       // 1000
C('exVat of £6000', exVat(6000), 5000)

S('tiny amounts (penny precision)')
{const m=computeMoney({gross:0.12,net:0.10,costPaid:0.06,vatTreatment:'standard'})
 C('fees 0.02',m.fees,0.02)
 C('vat of 0.10',m.vatPortion,VAT(0.10))}

S('huge amounts (no overflow/precision loss)')
{const m=computeMoney({gross:1_000_000,net:880_000,costPaid:600_000,vatTreatment:'standard'})
 C('profit at scale',m.trueProfit,EX(880000)-EX(600000))}

S('second-hand never charges or reclaims VAT')
{const m=computeMoney({gross:500,net:500,costPaid:300,vatTreatment:'second_hand'})
 C('vatOwed 0',m.vatOwed,0); C('netExVat==net',m.netExVat,500); C('costExVat==cost',m.costExVat,300)}

S('margin % safety (zero denominators)')
{const m=computeMoney({gross:0,net:0,costPaid:100,vatTreatment:'standard'})
 C('netMarginPct not NaN',m.netMarginPct,0)
 C('grossMarginPct not NaN',m.grossMarginPct,0)}

S('sumMoney: margins from totals NOT averaged (asymmetric streams)')
{const a=computeMoney({gross:10000,net:9000,costPaid:2000,vatTreatment:'standard'}) // fat margin
 const b=computeMoney({gross:100,net:95,costPaid:90,vatTreatment:'standard'})       // thin margin
 const t=sumMoney([a,b])
 const correctMargin=t.trueProfit/t.gross
 C('blended margin from totals',t.netMarginPct,correctMargin)
 // prove it's NOT the naive average
 const naiveAvg=(a.netMarginPct+b.netMarginPct)/2
 C('blended != naive average (should differ)',Math.abs(t.netMarginPct-naiveAvg)>0.001?1:0,1)}

S('VAT authority is the single source (change rate once would propagate)')
C('exVat uses /1.2',exVat(120),100)
C('vatOfInclusive uses fraction',vatOfInclusive(120),20)
C('consistency: exVat+vat = original',exVat(120)+vatOfInclusive(120),120)

console.log(`\n==== MONEY: ${pass} passed, ${fail} failed ====`)
process.exit(fail>0?1:0)
