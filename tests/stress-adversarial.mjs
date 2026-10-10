// ============ ADVERSARIAL / MALFORMED INPUT STRESS ============
// Proves the money engine never crashes or emits NaN/Infinity on hostile
// input: nulls, non-numeric strings, negatives, trillion-scale numbers,
// 5000-line streams, broken line objects, garbage VAT treatments, empty
// and junk arrays, and every division-by-zero path. Logic correctness is
// covered elsewhere; this file is purely about robustness (finite output).
import { computeMoney, computeStream, sumMoney, exVat } from '../src/money/engine.js'
let pass=0,fail=0
const C=(l,cond)=>{cond?pass++:fail++;console.log(`${cond?'✓':'✗ FAIL'}  ${l}`)}
const S=t=>console.log('\n--- '+t+' ---')
const finite=v=>Number.isFinite(v)

S('null / undefined / missing inputs do not crash or produce NaN')
{const m=computeMoney({})
 C('empty object: all finite', finite(m.gross)&&finite(m.trueProfit)&&finite(m.vatOwed))
 C('empty object: profit 0', m.trueProfit===0)}
{const m=computeMoney({gross:null,net:undefined,costPaid:null,vatTreatment:null})
 C('nulls everywhere: finite', finite(m.trueProfit)&&finite(m.netMarginPct))}
{const m=computeMoney({gross:'abc',net:'xyz',costPaid:'!!'})
 C('non-numeric strings -> 0, finite', finite(m.gross)&&m.gross===0)}

S('negative values (should compute, flagged upstream not crash)')
{const m=computeMoney({gross:-500,net:-400,costPaid:-200,vatTreatment:'standard'})
 C('negatives: finite', finite(m.trueProfit))}

S('extreme scale (no overflow)')
{const m=computeMoney({gross:1e12,net:9e11,costPaid:5e11,vatTreatment:'standard'})
 C('1 trillion: finite', finite(m.trueProfit)&&finite(m.vatOwed))}

S('computeStream with broken lines')
{const m=computeStream({gross:1000,net:900},[{qty:null,unitCost:undefined,lineTotal:'bad',brokered:false,stockItemId:null}],()=>'standard')
 C('broken line: finite', finite(m.trueProfit)&&finite(m.vatPortion))}
{const m=computeStream({gross:500},[],()=>'standard')  // empty lines
 C('empty lines: finite, cost 0', finite(m.trueProfit)&&m.costPaid===0)}
{const m=computeStream({gross:1000,net:900},Array(5000).fill({qty:1,unitCost:1,lineTotal:1,brokered:false,stockItemId:'A'}),()=>'standard')
 C('5000 lines: finite, no hang', finite(m.trueProfit))}

S('vatOf returns garbage')
{const m=computeStream({gross:1000,net:900},[{qty:5,unitCost:50,lineTotal:1000,brokered:false,stockItemId:'A'}],()=>'nonsense_treatment')
 C('unknown treatment -> treated as standard (VAT applied), finite', finite(m.vatOwed)&&m.vatOwed>0)}

S('sumMoney with empty / malformed arrays')
{C('sumMoney([]) finite', finite(sumMoney([]).gross)&&sumMoney([]).gross===0)
 const t=sumMoney([computeMoney({gross:100,net:90,costPaid:50,vatTreatment:'standard'}),{}])
 C('sumMoney with junk entry: finite', finite(t.gross))}

S('division-by-zero guards')
{const m=computeStream({gross:0,net:0},[{qty:0,unitCost:0,lineTotal:0,brokered:false,stockItemId:'A'}],()=>'standard')
 C('all-zero stream: no NaN', finite(m.netMarginPct)&&finite(m.grossMarginPct))}

console.log(`\n==== ADVERSARIAL: ${pass} passed, ${fail} failed ====`)
process.exit(fail>0?1:0)
