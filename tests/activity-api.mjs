import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const connection=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD,database:process.env.DB_NAME||'acmer_stats',dateStrings:true});
try{
 const current=await(await fetch(base+'/api/activity')).json();
 const [rows]=await connection.query('SELECT s.submitted_at,s.passed,s.problem_id,p.platform_name FROM synced_submission s JOIN platform p ON p.platform_id=s.platform_id JOIN user u ON u.user_id=s.user_id WHERE u.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)');
 const [activityRows]=await connection.query('SELECT a.activity_day,a.activity_count,p.platform_name FROM platform_daily_activity a JOIN platform p ON p.platform_id=a.platform_id WHERE a.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)');
 assert.equal(current.mode,'rolling');assert.equal(current.rangeEnd,current.serverDate);
 const span=(Date.parse(current.rangeEnd)-Date.parse(current.rangeStart))/86400000+1;assert.equal(span,365);
 assert.ok(current.days.every(d=>d.day>=current.rangeStart&&d.day<=current.rangeEnd));
 const inRange=r=>r.submitted_at.slice(0,10)>=current.rangeStart&&r.submitted_at.slice(0,10)<=current.rangeEnd;
 assert.equal(current.days.reduce((n,d)=>n+d.submission_count,0),rows.filter(inRange).length);
 assert.equal(current.days.reduce((n,d)=>n+d.accepted_count,0),rows.filter(r=>inRange(r)&&r.passed===1).length);
 assert.equal(current.days.reduce((n,d)=>n+d.activity_count,0),activityRows.filter(r=>r.activity_day>=current.rangeStart&&r.activity_day<=current.rangeEnd).reduce((n,r)=>n+r.activity_count,0));
 for(const year of current.years){
  const response=await fetch(base+'/api/activity?year='+year);assert.equal(response.status,200);const body=await response.json();
  const expected=new Map();
  for(const r of rows){
   const day=r.submitted_at.slice(0,10);if(!day.startsWith(year+'-')||day>body.serverDate)continue;
   const key=day+'|'+r.platform_name;
   if(!expected.has(key))expected.set(key,{day,platform_name:r.platform_name,submission_count:0,accepted_count:0,activity_count:0,has_submission_data:true,has_activity_data:false,problems:new Set(),ac:new Set()});
   const row=expected.get(key);row.submission_count++;row.problems.add(r.problem_id);
   if(r.passed===1){row.accepted_count++;row.ac.add(r.problem_id);}
  }
  for(const r of activityRows){
   const day=r.activity_day;if(!day.startsWith(year+'-')||day>body.serverDate)continue;
   const key=day+'|'+r.platform_name;
   if(!expected.has(key))expected.set(key,{day,platform_name:r.platform_name,submission_count:0,accepted_count:0,activity_count:0,has_submission_data:false,has_activity_data:true,problems:new Set(),ac:new Set()});
   const row=expected.get(key);row.activity_count+=r.activity_count;row.has_activity_data=true;
  }
  assert.equal(body.days.length,expected.size);
  for(const actual of body.days){const {problems,ac,...r}=expected.get(actual.day+'|'+actual.platform_name);assert.deepEqual(actual,{...r,problem_count:problems.size,accepted_problem_count:ac.size});}
 }
 for(const year of ['abc','1969',String(Number(current.serverDate.slice(0,4))+1)])assert.equal((await fetch(base+'/api/activity?year='+year)).status,400);
 console.log('PASS: yearly daily counts and unique AC/attempted problems match raw submissions; invalid years rejected');
}finally{await connection.end();}
