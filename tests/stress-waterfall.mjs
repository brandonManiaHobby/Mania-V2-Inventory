// ============ WATERFALL RECOVERY (Option C) STRESS ============
// Option C: a sale recovers cost ex-VAT with its net ex-VAT — like-for-like,
// both VAT-stripped. Proves computeMoney and computeStream expose the same
// recovery basis, that second-hand passes through unstripped, and that a
// wave's recovery accumulates correctly to "paid off".
import { computeMoney, computeStream } from '../src/money/engine.js'
let pass=0,fail=0
const C=(l,g,w,eps=0.01)=>{const ok=Math.abs(g-w)<eps;ok?pass++:fail++;console.log(`${ok?'✓':'✗ FAIL'}  ${l}: ${g.toFixed(4)} (want ${w.toFixed(4)})`)}
const CT=(l,cond)=>{cond?pass++:fail++;console.log(`${cond?'✓':'✗ FAIL'}  ${l}`)}
const S=t=>console.log('\n--- '+t+' ---')

S('standard sale: recovery = net ex-VAT, basis = cost ex-VAT')
{const m=computeMoney({gross:600,net:600,costPaid:360,vatTreatment:'standard'})
 C('recoveryContribution = 600/1.2', m.recoveryContribution, 500)
 C('recoveryCostBasis = 360/1.2', m.recoveryCostBasis, 300)}

S('second-hand sale: recovery & basis pass through UNSTRIPPED (VAT-free)')
{const m=computeMoney({gross:600,net:600,costPaid:360,vatTreatment:'second_hand'})
 C('recoveryContribution = 600 (no strip)', m.recoveryContribution, 600)
 C('recoveryCostBasis = 360 (no strip)', m.recoveryCostBasis, 360)}

S('computeStream agrees with computeMoney on recovery (the two paths must tie)')
{const s=computeStream({gross:600,net:600},[{qty:1,unitCost:360,lineTotal:600,brokered:false,stockItemId:'A'}],()=>'standard')
 C('stream recovery == 500', s.recoveryContribution, 500)
 C('stream cost basis == 300', s.recoveryCostBasis, 300)}
{const s=computeStream({gross:600,net:600},[{qty:1,unitCost:360,lineTotal:600,brokered:false,stockItemId:'A'}],()=>'second_hand')
 C('2nd-hand stream recovery == 600', s.recoveryContribution, 600)
 C('2nd-hand stream basis == 360', s.recoveryCostBasis, 360)}

S('mixed-VAT stream: standard line stripped, 2nd-hand line not')
{const vat=id=>id==='SH'?'second_hand':'standard'
 const s=computeStream({gross:1200,net:1200},[
   {qty:1,unitCost:360,lineTotal:600,brokered:false,stockItemId:'STD'},  // standard
   {qty:1,unitCost:360,lineTotal:600,brokered:false,stockItemId:'SH'},   // 2nd-hand
 ],vat)
 // cost basis = 360/1.2 (std) + 360 (sh) = 300 + 360 = 660
 C('mixed cost basis = 300 + 360 = 660', s.recoveryCostBasis, 660)
 // VAT only on the standard line's net share (600/1200 * 1200 = 600 net share) -> vat 100
 C('mixed vat only on std line', s.vatPortion, 100)}

S('wave recovery accumulates to paid-off')
{// wave cost basis ex-VAT = 1000. Three standard sales of net 400 each.
 const sale=computeMoney({gross:400,net:400,costPaid:0,vatTreatment:'standard'})
 const recovered = 3*sale.recoveryContribution   // 3 * 333.333 = 1000
 C('3x net-400 recovers 1000 ex-VAT', recovered, 1000)
 CT('wave is paid off when recovered >= basis', recovered >= 1000-0.01)}

S('brokered lines excluded from recovery (not our stock)')
{const s=computeStream({gross:600,net:600},[
   {qty:1,unitCost:360,lineTotal:600,brokered:true,stockItemId:'A'}, // brokered -> excluded
 ],()=>'standard')
 C('brokered line contributes no cost basis', s.recoveryCostBasis, 0)}

console.log(`\n==== WATERFALL: ${pass} passed, ${fail} failed ====`)
process.exit(fail>0?1:0)
