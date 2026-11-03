import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCalendar,activityLevel} from '../src/frontend/activity-calendar.js';
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
