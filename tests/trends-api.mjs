import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
const base='http://127.0.0.1:3000/api/trends',db=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD,database:process.env.DB_NAME||'acmer_stats',dateStrings:true});
try{
 const [all]=await db.query('SELECT s.problem_id,s.submitted_at,s.passed,p.platform_name FROM synced_submission s JOIN platform p ON p.platform_id=s.platform_id WHERE s.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)');
 for(const query of ['mode=year&grain=month','mode=month&grain=week','mode=life&grain=day','mode=life&grain=threeYear','mode=life&grain=quarter&platform=Codeforces']){
  const response=await fetch(base+'?'+query);assert.equal(response.status,200);const body=await response.json();
  const platform=new URLSearchParams(query).get('platform'),rows=all.filter(r=>!platform||r.platform_name===platform),first=new Map();
  for(const r of rows)if(r.passed===1&&(!first.has(r.problem_id)||r.submitted_at<first.get(r.problem_id)))first.set(r.problem_id,r.submitted_at);
  for(const b of body.buckets){
   const inside=ts=>ts.slice(0,10)>=b.start&&ts.slice(0,10)<=b.end;
   assert.equal(b.submission_count,rows.filter(r=>inside(r.submitted_at)).length);
   assert.equal(b.accepted_count,rows.filter(r=>inside(r.submitted_at)&&r.passed===1).length);
   assert.equal(b.first_ac_count,[...first.values()].filter(inside).length,'first AC must be computed before restricting the visible window');
  }
 }
 for(const query of ['mode=bad','mode=month&grain=year','mode=year&year=1969','mode=month&month=2026-99','platform=unknown'])assert.equal((await fetch(base+'?'+query)).status,400);
 console.log('PASS: all trend buckets match raw history including global first AC, platform filters and invalid queries');
}finally{await db.end();}
