import test from 'node:test';
import assert from 'node:assert/strict';
import {trendRange,trendBuckets} from '../src/backend/trends.js';
test('month and year selection clip at today and reject invalid combinations',()=>{
 assert.deepEqual(trendRange({mode:'month',month:'2024-02',grain:'day'},'2026-11-04'),{mode:'month',grain:'day',start:'2024-02-01',end:'2024-02-29',endExclusive:'2024-03-01'});
 assert.equal(trendRange({mode:'year',year:'2026'},'2026-11-04').end,'2026-11-04');
 for(const q of [{mode:'month',grain:'year'},{mode:'year',grain:'threeYear'},{mode:'month',month:'2026-13'},{mode:'month',month:'2026-12'},{mode:'year',year:'abc'}])assert.throws(()=>trendRange(q,'2026-11-04'),e=>e.status===400);
});
test('weeks start Monday but only selected dates are counted',()=>{
 const range=trendRange({mode:'month',month:'2026-11',grain:'week'},'2026-11-04');
 const b=trendBuckets(range,[{day:'2026-10-31',submission_count:99},{day:'2026-11-01',submission_count:2},{day:'2026-11-02',submission_count:3}]);
 assert.equal(b[0].key,'2026-10-26');assert.equal(b[0].start,'2026-11-01');assert.equal(b[0].end,'2026-11-01');assert.equal(b[0].submission_count,2);
 assert.equal(b[1].key,'2026-11-02');assert.equal(b[1].submission_count,3);
});
test('quarters, three-year groups, empty buckets and leap days preserve totals',()=>{
 const q=trendBuckets(trendRange({mode:'year',year:'2024',grain:'quarter'},'2026-11-04'),[{day:'2024-02-29',accepted_count:2,first_ac_count:1},{day:'2024-04-01',accepted_count:3}]);
 assert.equal(q.length,4);assert.equal(q[0].accepted_count,2);assert.equal(q[1].accepted_count,3);assert.equal(q[3].accepted_count,0);
 const life=trendBuckets(trendRange({mode:'life',grain:'threeYear'},'2026-11-04','2020-07-01'),[{day:'2023-01-01',first_ac_count:5}]);
 assert.deepEqual(life.map(b=>b.label),['2020—2022','2023—2025','2026—2028']);assert.equal(life[1].first_ac_count,5);assert.equal(life.at(-1).end,'2026-11-04');
 const days=trendBuckets(trendRange({mode:'year',year:'2024',grain:'day'},'2026-11-04'),[]);assert.equal(days.length,366);
});
