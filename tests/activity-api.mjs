import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const connection=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD,database:process.env.DB_NAME||'acmer_stats',dateStrings:true});
try{
 const current=await(await fetch(base+'/api/activity')).json();
 const [rows]=await connection.query('SELECT s.submitted_at,s.passed,s.problem_id,p.platform_name FROM synced_submission s JOIN platform p ON p.platform_id=s.platform_id JOIN user u ON u.user_id=s.user_id WHERE u.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)');
 for(const year of current.years){
  const response=await fetch(base+'/api/activity?year='+year);assert.equal(response.status,200);const body=await response.json();
  const expected=new Map();
  for(const r of rows){
   const day=r.submitted_at.slice(0,10);if(!day.startsWith(year+'-')||day>body.serverDate)continue;
   const key=day+'|'+r.platform_name;
   if(!expected.has(key))expected.set(key,{day,platform_name:r.platform_name,submission_count:0,accepted_count:0,problems:new Set(),ac:new Set()});
   const row=expected.get(key);row.submission_count++;row.problems.add(r.problem_id);
   if(r.passed===1){row.accepted_count++;row.ac.add(r.problem_id);}
  }
  assert.equal(body.days.length,expected.size);
  for(const actual of body.days){const {problems,ac,...r}=expected.get(actual.day+'|'+actual.platform_name);assert.deepEqual(actual,{...r,problem_count:problems.size,accepted_problem_count:ac.size});}
 }
 for(const year of ['abc','1969',String(Number(current.serverDate.slice(0,4))+1)])assert.equal((await fetch(base+'/api/activity?year='+year)).status,400);
 console.log('PASS: yearly daily counts and unique AC/attempted problems match raw submissions; invalid years rejected');
}finally{await connection.end();}
