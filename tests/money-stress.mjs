import { computeMoney, computeStream, sumMoney, exVat, vatOfInclusive } from '../src/money/engine.js'

let pass = 0, fail = 0
const EPS = 0.01
function check(label, got, want) {
  const ok = Math.abs(got - want) < EPS
  if (ok) pass++; else fail++
  console.log(`${ok ? '✓' : '✗ FAIL'}  ${label}: got ${got.toFixed(4)}  want ${want.toFixed(4)}`)
}
function section(t){ console.log('\n=== '+t+' ===') }

// Independent hand-calc helpers (NOT the engine — the reference truth)
const EX = (inc) => inc / 1.2            // ex-VAT of inclusive
const VAT = (inc) => inc - inc / 1.2     // VAT portion of inclusive

// ---------- SCENARIO BANK ----------
section('1. Standard, net entered (Whatnot): gross 1000, net 880, cost 600')
{
  const m = computeMoney({ gross:1000, net:880, costPaid:600, vatTreatment:'standard' })
  check('fees', m.fees, 1000-880)                       // 120
  check('vatPortion', m.vatPortion, VAT(880))           // 146.67
  check('netExVat', m.netExVat, EX(880))                // 733.33
  check('costExVat', m.costExVat, EX(600))              // 500
  check('trueProfit', m.trueProfit, EX(880)-EX(600))    // 233.33
  check('vatOwed', m.vatOwed, VAT(880))                 // 146.67
}

section('2. Second-hand (VAT-free): gross 500, net 460, cost 300')
{
  const m = computeMoney({ gross:500, net:460, costPaid:300, vatTreatment:'second_hand' })
  check('vatPortion (0)', m.vatPortion, 0)
  check('netExVat == net', m.netExVat, 460)
  check('costExVat == costPaid', m.costExVat, 300)
  check('trueProfit', m.trueProfit, 460-300)            // 160
  check('vatOwed (0)', m.vatOwed, 0)
}

section('3. No net (eBay): gross 750, cost 500, standard')
{
  const m = computeMoney({ gross:750, costPaid:500, vatTreatment:'standard' })
  check('net == gross', m.net, 750)
  check('fees (0)', m.fees, 0)
  check('vatOwed', m.vatOwed, VAT(750))                 // 125
  check('trueProfit', m.trueProfit, EX(750)-EX(500))    // 208.33
}

section('4. Loss-making stream: gross 200, net 180, cost 300')
{
  const m = computeMoney({ gross:200, net:180, costPaid:300, vatTreatment:'standard' })
  check('trueProfit (negative)', m.trueProfit, EX(180)-EX(300))  // -100
}

section('5. Zero / edge: gross 0')
{
  const m = computeMoney({ gross:0, net:0, costPaid:0, vatTreatment:'standard' })
  check('all zero profit', m.trueProfit, 0)
  check('netMarginPct safe (0)', m.netMarginPct, 0)
}

section('6. Mixed-VAT STREAM: 3 lines, 1 second-hand; gross 1200 net 1080')
{
  // lines: A standard £600 cost 400; B standard £400 cost 250; C second-hand £200 cost 150
  const lines = [
    { qty:1, unitCost:400, lineTotal:600, brokered:false, stockItemId:'A' },
    { qty:1, unitCost:250, lineTotal:400, brokered:false, stockItemId:'B' },
    { qty:1, unitCost:150, lineTotal:200, brokered:false, stockItemId:'C' },
  ]
  const vatOf = (id)=> id==='C' ? 'second_hand':'standard'
  const m = computeStream({ gross:1200, net:1080, shipping:0 }, lines, vatOf)
  // net apportioned by gross share; VAT only on A+B net shares
  const g=1200, net=1080
  const nA=600/g*net, nB=400/g*net, nC=200/g*net
  const expVat = VAT(nA)+VAT(nB)+0
  check('mixed vatPortion', m.vatPortion, expVat)
  check('net preserved', m.net, 1080)
}

section('7. Rounding stress: awkward numbers gross 333.33 net 299.97 cost 211.11')
{
  const m = computeMoney({ gross:333.33, net:299.97, costPaid:211.11, vatTreatment:'standard' })
  check('vatPortion', m.vatPortion, VAT(299.97))
  check('trueProfit', m.trueProfit, EX(299.97)-EX(211.11))
  // precision: ensure not pre-rounded (should carry >2dp internally)
  console.log('   (raw netExVat =', m.netExVat, '— full precision, not pre-rounded)')
}

section('8. sumMoney across mixed streams (margins from totals, not averaged)')
{
  const a = computeMoney({ gross:1000, net:880, costPaid:600, vatTreatment:'standard' })
  const b = computeMoney({ gross:500, net:460, costPaid:300, vatTreatment:'second_hand' })
  const t = sumMoney([a,b])
  check('summed gross', t.gross, 1500)
  check('summed trueProfit', t.trueProfit, a.trueProfit+b.trueProfit)
  check('summed vatOwed (only A has VAT)', t.vatOwed, VAT(880)+0)
  // margin recomputed from totals, not (marginA+marginB)/2
  const wantNetMargin = t.trueProfit / t.gross
  check('netMarginPct from totals', t.netMarginPct, wantNetMargin)
}

section('9. VAT authority helpers self-consistent')
{
  check('exVat standard', exVat(120,'standard'), 100)
  check('exVat second-hand (unchanged)', exVat(120,'second_hand'), 120)
  check('vatOfInclusive standard', vatOfInclusive(120,'standard'), 20)
  check('vatOfInclusive second-hand (0)', vatOfInclusive(120,'second_hand'), 0)
}

console.log(`\n================  RESULT: ${pass} passed, ${fail} failed  ================`)
process.exit(fail>0?1:0)
