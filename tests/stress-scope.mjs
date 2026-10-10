// ============ SCOPING STRESS (the "users only see what they're permitted"
// cutover guarantee). Proves scopeSource() filters at the source boundary
// for all 5 roles, with no cross-department / cross-streamer leak and a
// least-privilege default on unknown/null roles. Pure logic — importable. ====
import { scopeSource } from '../src/scoping/scope.js'
import { capabilities } from '../src/scoping/roles.js'
let pass=0,fail=0
const C=(l,cond)=>{cond?pass++:fail++;console.log(`${cond?'✓':'✗ FAIL'}  ${l}`)}
const S=t=>console.log('\n--- '+t+' ---')

// ---- fixture: 2 departments, every role represented ----
const P = {
  admin:   { id:'admin1', name:'Admin',  role:'admin',        department:'sports' },
  mgr:     { id:'mgr1',   name:'Mgr',    role:'manager',      department:'tcg'    },
  leadS:   { id:'leadS',  name:'LeadS',  role:'channel_lead', department:'sports' },
  leadT:   { id:'leadT',  name:'LeadT',  role:'channel_lead', department:'tcg'    },
  wh:      { id:'wh1',    name:'WH',     role:'warehouse',    department:null     },
  strA:    { id:'strA',   name:'A',      role:'breaker',      department:'sports' },
  strB:    { id:'strB',   name:'B',      role:'breaker',      department:'tcg'    },
  strC:    { id:'strC',   name:'C',      role:'breaker',      department:'sports' },
}
const source = {
  stockItems:[{id:'i1'},{id:'i2'}],
  waves:[{id:'w1'},{id:'w2'}],
  distroSales:[{id:'d1'},{id:'d2'}],
  profiles:Object.values(P),
  streams:[
    {id:'s1', streamerId:'strA'},  // sports
    {id:'s2', streamerId:'strB'},  // tcg
    {id:'s3', streamerId:'strC'},  // sports
    {id:'s4', streamerId:'strA'},  // sports
  ],
  streamLines:[
    {id:'l1', streamId:'s1'}, {id:'l2', streamId:'s2'},
    {id:'l3', streamId:'s3'}, {id:'l4', streamId:'s4'},
    {id:'l5', streamId:'s1'},
  ],
  holdings:[
    {id:'h1', holderId:'strA'}, {id:'h2', holderId:'strB'},
    {id:'h3', holderId:'strC'}, {id:'h4', holderId:null},   // warehouse
  ],
}
const ids = arr => arr.map(x=>x.id).sort().join(',')

S('ADMIN sees everything (business-wide, unfiltered)')
{const v=scopeSource(source,P.admin)
 C('admin: all 4 streams', v.streams.length===4)
 C('admin: all 8 profiles', v.profiles.length===8)
 C('admin: all 4 holdings', v.holdings.length===4)
 C('admin: all 5 lines', v.streamLines.length===5)
 C('admin: cap.seesAllDepartments', v.cap.seesAllDepartments===true)}

S('MANAGER sees everything (same as admin)')
{const v=scopeSource(source,P.mgr)
 C('manager: all 4 streams', v.streams.length===4)
 C('manager: all 8 profiles', v.profiles.length===8)
 C('manager: seesAllDepartments', v.cap.seesAllDepartments===true)}

S('LEAD is department-scoped (NOT business-wide)')
{const v=scopeSource(source,P.leadS)
 C('leadS: NOT seesAllDepartments', v.cap.seesAllDepartments===false)
 C('leadS: 3 sports streams (s1,s3,s4)', ids(v.streams)==='s1,s3,s4')
 C('leadS: excludes tcg stream s2', !v.streams.some(s=>s.id==='s2'))
 C('leadS: 4 lines, none orphaned to s2', ids(v.streamLines)==='l1,l3,l4,l5')
 C('leadS: only sports profiles (admin,leadS,strA,strC)', ids(v.profiles)==='admin1,leadS,strA,strC')
 C('leadS: keeps full inventory (holdings)', v.holdings.length===4)
 C('leadS: keeps stockItems', v.stockItems.length===2)}
{const v=scopeSource(source,P.leadT)
 C('leadT: only s2 (tcg)', ids(v.streams)==='s2')
 C('leadT: only l2', ids(v.streamLines)==='l2')
 C('leadT: tcg profiles (mgr,leadT,strB)', ids(v.profiles)==='leadT,mgr1,strB')}

S('WAREHOUSE sees inventory but NO streams')
{const v=scopeSource(source,P.wh)
 C('warehouse: zero streams', v.streams.length===0)
 C('warehouse: zero stream lines', v.streamLines.length===0)
 C('warehouse: keeps holdings', v.holdings.length===4)
 C('warehouse: keeps stockItems', v.stockItems.length===2)
 C('warehouse: canMoveStock', v.cap.canMoveStock===true)}

S('STREAMER sees ONLY their own streams/shelf/profile')
{const v=scopeSource(source,P.strA)
 C('strA: own 2 streams (s1,s4)', ids(v.streams)==='s1,s4')
 C('strA: no other-streamer streams (s2,s3 gone)', !v.streams.some(s=>['s2','s3'].includes(s.id)))
 C('strA: own 3 lines (l1,l4,l5)', ids(v.streamLines)==='l1,l4,l5')
 C('strA: own 1 holding only', ids(v.holdings)==='h1')
 C('strA: does NOT see warehouse holding h4', !v.holdings.some(h=>h.id==='h4'))
 C('strA: own profile only', ids(v.profiles)==='strA')}
{const v=scopeSource(source,P.strB)
 C('strB: own 1 stream (s2)', ids(v.streams)==='s2')
 C('strB: own 1 line (l2)', ids(v.streamLines)==='l2')
 C('strB: own holding (h2)', ids(v.holdings)==='h2')}

S('LEAST PRIVILEGE: unknown/null role never over-grants')
{const v=scopeSource(source,{id:'ghost',role:'superuser',department:'sports'})
 C('unknown role -> streamer default', v.cap.role==='streamer')
 C('unknown role: not seesAllDepartments', v.cap.seesAllDepartments===false)
 C('unknown role id matches nobody -> 0 streams', v.streams.length===0)
 C('unknown role -> 0 holdings', v.holdings.length===0)}
{const v=scopeSource(source,null)
 C('null profile -> streamer default', v.cap.role==='streamer')
 C('null profile -> not seesAllDepartments', v.cap.seesAllDepartments===false)
 C('null profile -> 0 own streams', v.streams.length===0)}

S('null source -> empty view, never crash')
{const v=scopeSource(null,P.admin)
 C('null source: empty streams', v.streams.length===0)
 C('null source: empty holdings', v.holdings.length===0)
 C('null source: cap still attached', v.cap && v.cap.isAdmin===true)}

console.log(`\n==== SCOPE: ${pass} passed, ${fail} failed ====`)
process.exit(fail>0?1:0)
