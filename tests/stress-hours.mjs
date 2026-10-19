// ============ HOURS STRESS (midnight-crossing) ============
import { hoursOf } from '../src/data/helpers.js'
let pass=0,fail=0
const C=(l,g,w)=>{const ok=(typeof g==='number'?Math.abs(g-w)<0.01:g===w);ok?pass++:fail++;console.log(`${ok?'✓':'✗ FAIL'}  ${l}: ${typeof g==='number'?g.toFixed(2):g} (want ${typeof w==='number'?w.toFixed(2):w})`)}
const S=t=>console.log('\n--- '+t+' ---')
const H=(start,end)=>hoursOf({streamStart:start,streamEnd:end})

S('same-day streams')
C('14:25 -> 16:32', H('14:25','16:32'), 2.1166667)
C('12:00 -> 14:45', H('12:00','14:45'), 2.75)
C('10:15 -> 15:01', H('10:15','15:01'), 4.7666667)

S('overnight streams cross midnight (the bug)')
C('18:00 -> 00:00 = 6h', H('18:00','00:00'), 6)
C('20:34 -> 00:04 = 3.5h', H('20:34','00:04'), 3.5)
C('19:25 -> 01:55 = 6.5h', H('19:25','01:55'), 6.5)
C('18:00 -> 02:02', H('18:00','02:02'), 8.0333333)
C('19:45 -> 00:45 = 5h', H('19:45','00:45'), 5)
C('21:00 -> 00:15 = 3.25h', H('21:00','00:15'), 3.25)

S('edge cases')
C('missing start -> 0', H(null,'02:00'), 0)
C('missing end -> 0', H('18:00',null), 0)
C('equal times -> 0', H('20:00','20:00'), 0)
C('one minute before midnight', H('23:59','00:01'), 0.0333333)

console.log(`\n==== HOURS: ${pass} passed, ${fail} failed ====`)
