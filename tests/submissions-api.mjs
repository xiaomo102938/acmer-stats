import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
const base='http://127.0.0.1:3000/api/submissions';
const db=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD,database:process.env.DB_NAME||'acmer_stats',dateStrings:true});
try{
 const [[user]]=await db.query('SELECT user_id FROM user ORDER BY user_id LIMIT 1');
 const [expected]=await db.execute('SELECT submission_id,submitted_at FROM synced_submission WHERE user_id=? ORDER BY submitted_at DESC,submission_id DESC LIMIT 50',[user.user_id]);
 const one=await(await fetch(base+'?page=1&pageSize=25')).json(),two=await(await fetch(base+'?page=2&pageSize=25')).json();
 assert.deepEqual([...one.items,...two.items].map(r=>r.submission_id),expected.map(r=>r.submission_id));
 assert.ok(one.total>=one.items.length);assert.equal(one.page,1);assert.ok(one.items.every(r=>r.submitted_at&&r.source_id&&typeof r.passed==='number'));
 const last=await(await fetch(base+'?page=99999999&pageSize=25')).json();assert.equal(last.page,last.pages);assert.ok(last.items.length<=25);
 for(const query of ['page=0','page=-1','page=1.5','page=abc','pageSize=1000','pageSize=25%20OR%201=1'])assert.equal((await fetch(base+'?'+query)).status,400);
 const [plan]=await db.execute('EXPLAIN SELECT submission_id FROM synced_submission WHERE user_id=? ORDER BY submitted_at DESC,submission_id DESC LIMIT 25',[user.user_id]);
 assert.equal(plan[0].key,'idx_submission_page');
 console.log('PASS: database-backed ordered pagination, stable ties, page boundaries, invalid input rejection and time index');
}finally{await db.end();}
