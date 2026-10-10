#!/bin/sh
# Run the full Mania V2 stress suite. Any failure exits non-zero.
cd "$(dirname "$0")/.."
fail=0
for t in money-stress lifecycle-stress stress-stock stress-stream stress-money stress-reporting stress-adversarial stress-scope stress-drift stress-waterfall; do
  if node "tests/$t.mjs" >/dev/null 2>&1; then echo "  PASS  $t"; else echo "  FAIL  $t"; fail=1; fi
done
[ $fail -eq 0 ] && echo "ALL STRESS TESTS PASS" || echo "SOME TESTS FAILED"
exit $fail
