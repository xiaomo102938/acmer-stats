import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCalendar,buildRollingCalendar,activityLevel} from '../src/frontend/activity-calendar.js';
test('leap-year calendar includes all 366 dates and aligns Sunday-first weeks',()=>{
 const c=buildCalendar(2024,[],'2024-12-31');
 assert.equal(c.cells.filter(d=>d.inside).length,366);
 assert.equal(c.cells.length%7,0);
 assert.equal(new Date(c.cells[0].day+'T00:00:00Z').getUTCDay(),0);
 assert.ok(c.cells.some(d=>d.day==='2024-02-29'));
});
test('days merge platform totals and distinguish unique AC counts from submissions',()=>{
 const c=buildCalendar(2026,[{day:'2026-01-01',accepted_problem_count:2,submission_count:6,accepted_count:3},{day:'2026-01-01',accepted_problem_count:1,submission_count:2,accepted_count:1}],'2026-11-03');
 const d=c.cells.find(d=>d.day==='2026-01-01');
 assert.equal(d.value,3);assert.equal(d.submission_count,8);assert.equal(d.accepted_count,4);
 assert.equal(d.level,2);
});
test('future and empty days stay uncolored and padded cells stay outside the year',()=>{
 const c=buildCalendar(2026,[{day:'2026-12-31',submission_count:20}],'2026-11-03','submission_count');
 const future=c.cells.find(d=>d.day==='2026-12-31');assert.equal(future.future,true);assert.equal(future.level,0);
 const empty=c.cells.find(d=>d.day==='2026-01-02');assert.equal(empty.value,0);assert.equal(empty.level,0);
 assert.equal(c.cells.filter(d=>d.inside).length,365);
});
test('color thresholds are fixed and stable across filters',()=>{
 assert.deepEqual([0,1,2,3,5,6,9,10,100].map(activityLevel),[0,1,1,2,2,3,3,4,4]);
});

test('rolling view spans exactly 365 days across years and never generates future cells',()=>{
 const c=buildRollingCalendar([{day:'2025-11-05',submission_count:2},{day:'2026-11-05',submission_count:99}],'2026-11-04','submission_count');
 assert.equal(c.rangeStart,'2025-11-05');assert.equal(c.rangeEnd,'2026-11-04');assert.equal(c.cells.filter(d=>d.inside).length,365);
 assert.ok(c.cells.every(d=>d.day<='2026-11-04'));assert.equal(c.cells.at(-1).day,'2026-11-04');
 assert.equal(c.cells.find(d=>d.day==='2025-11-05').value,2);assert.equal(c.cells[0].future,false);
 assert.equal(new Date(c.cells[0].day+'T00:00:00Z').getUTCDay(),0);assert.equal(new Set(c.months.map(m=>m.key)).size,c.months.length);
});
test('rolling boundaries retain leap day and January 1 correctly',()=>{
 const leap=buildRollingCalendar([],'2024-03-01');assert.ok(leap.cells.some(d=>d.inside&&d.day==='2024-02-29'));assert.equal(leap.cells.filter(d=>d.inside).length,365);
 const january=buildRollingCalendar([],'2026-01-01');assert.equal(january.rangeStart,'2025-01-02');assert.equal(january.cells.filter(d=>d.inside).length,365);
});
