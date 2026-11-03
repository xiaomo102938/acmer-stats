import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
const response=await fetch(base+'/api/dashboard');
assert.equal(response.status,200);
const data=await response.json();
const qoj=data.platforms.filter(p=>p.platform_name==='QOJ');
assert.equal(qoj.length,1,'QOJ should appear exactly once');
const p=qoj[0];
assert.ok(p.total_count>=0);
if(p.total_count===0){
 assert.equal(p.passed_count,0);
 assert.equal(p.pass_rate,null,'No records means no pass-rate sample');
}
assert.equal(data.platforms.reduce((sum,p)=>sum+p.total_count,0),data.overview?.total_problems??0);
assert.equal(data.platforms.filter(p=>p.total_count>0).length,data.overview?.platform_count??0);
console.log('PASS: QOJ platform visibility and platform aggregate consistency');
