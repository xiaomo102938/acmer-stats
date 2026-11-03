// Read-only comparison against raw synchronized submissions.
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
const connection=await mysql.createConnection({
 host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),
 user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD,
 database:process.env.DB_NAME||'acmer_stats',dateStrings:true
});
try{
 const response=await fetch((process.env.TEST_BASE_URL||'http://127.0.0.1:3000')+'/api/dashboard');
 assert.equal(response.status,200);
 const data=await response.json();
 const [[clock]]=await connection.query('SELECT CURRENT_DATE() AS day');
 assert.equal(data.serverDate,clock.day);
 const first=new Date(clock.day+'T00:00:00Z');first.setUTCDate(first.getUTCDate()-6);
 const from=first.toISOString().slice(0,10);
 const [rows]=await connection.query('SELECT submitted_at,passed,problem_id FROM synced_submission');
 const included=rows.filter(r=>r.submitted_at.slice(0,10)>=from&&r.submitted_at.slice(0,10)<=clock.day);
 const groups=new Map();
 for(const row of included){
  const day=row.submitted_at.slice(0,10);
  if(!groups.has(day))groups.set(day,{day,submission_count:0,accepted_count:0,problems:new Set()});
  const group=groups.get(day);group.submission_count++;group.accepted_count+=Number(row.passed===1);group.problems.add(row.problem_id);
 }
 const expected=[...groups.values()].sort((a,b)=>a.day.localeCompare(b.day)).map(({problems,...row})=>({...row,problem_count:problems.size}));
 assert.deepEqual(data.daily,expected);
 assert.equal(data.weekProblems,new Set(included.map(r=>r.problem_id)).size);
 console.log('PASS: seven-day boundaries, daily submission/AC totals and cross-day problem deduplication match raw records');
}finally{await connection.end();}
