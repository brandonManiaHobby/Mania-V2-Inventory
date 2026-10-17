// Projection engine — behaviour lock. Run: node tests/projection.test.mjs
import { projectPeriod, monthFractionElapsed, weekFractionElapsed, monthlyProjection } from '../src/money/projection.js'

let pass = 0, fail = 0
const ok = (name, cond) => { cond ? pass++ : fail++; if (!cond) console.log('  ✗ ' + name) }
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol

// Never projects below what's already banked.
ok('never below banked', projectPeriod([100, 100, 100], 500, 0.2).projected >= 500)

// Pure run-rate with no history: half the period in at £500 → ~£1000.
ok('run-rate doubles at half-period', near(projectPeriod([], 500, 0.5).projected, 1000, 1))

// Flat history + matching pace → lands on the flat level.
ok('flat history holds level', near(projectPeriod([1000, 1000, 1000], 100, 0.1).projected, 1000, 1))

// Late in the period it trusts actuals over an optimistic history.
{
  const p = projectPeriod([2000, 2000, 2000], 400, 1)   // frac=1 → fully run-rate
  ok('full period trusts actuals', near(p.projected, 400, 1))
}

// remainder = projected − banked, and basis reflects history depth.
{
  const p = projectPeriod([100, 200, 300], 50, 0.25)
  ok('remainder is projected minus banked', near(p.remainder, p.projected - 50, 0.01))
  ok('basis names trend with enough history', p.basis === 'trend + run-rate')
  ok('basis flags thin history', projectPeriod([100], 10, 0.2).basis === 'limited history')
  ok('basis flags no history', projectPeriod([], 10, 0.2).basis === 'run-rate only')
}

// Fraction helpers stay in (0,1].
ok('month fraction in (0,1]', (() => { const f = monthFractionElapsed(new Date()); return f > 0 && f <= 1 })())
ok('week fraction in (0,1]', (() => { const f = weekFractionElapsed(new Date()); return f > 0 && f <= 1 })())

// monthlyProjection returns 6 completed + current, with the current last.
{
  const now = new Date(2026, 9, 17)   // 17 Oct 2026
  const items = [
    { d: '2026-05-10', v: 100 }, { d: '2026-06-10', v: 200 }, { d: '2026-07-10', v: 300 },
    { d: '2026-08-10', v: 400 }, { d: '2026-09-10', v: 500 }, { d: '2026-10-05', v: 250 },
  ]
  const mp = monthlyProjection(items, (x) => x.d, (x) => x.v, 6, now)
  ok('returns 6 months + current (7 keys)', mp.keys.length === 7)
  ok('current month is last', mp.keys[6] === '2026-10')
  ok('current month MTD captured', mp.mtd === 250)
  ok('current month projected above MTD', mp.projection.projected >= 250)
}

console.log(`==== PROJECTION: ${pass} passed, ${fail} failed ====`)
process.exit(fail ? 1 : 0)
