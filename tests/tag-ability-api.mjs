import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const connection=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD,database:process.env.DB_NAME||'acmer_stats',decimalNumbers:true});
try{
 const data=await(await fetch(base+'/api/dashboard')).json();
 assert.ok(data.tags.some(t=>t.tag_name==='dp'&&t.display_name==='动态规划 / Dynamic Programming'));
 assert.ok(!data.tags.some(t=>['动态规划','贪心','数学','图论','字符串','二分','数据结构'].includes(t.tag_name)));
 const [raw]=await connection.query(`SELECT pt.tag_id,p.platform_name,pr.native_difficulty,pr.difficulty_source,pr.problem_id,r.passed FROM record r
 JOIN problem pr ON pr.problem_id=r.problem_id JOIN platform p ON p.platform_id=pr.platform_id JOIN problem_tag pt ON pt.problem_id=pr.problem_id
 WHERE r.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)`);
 for(const profile of data.tagAbility){
  const rows=raw.filter(r=>r.tag_id===profile.tag_id&&r.platform_name===profile.platform_name);
  const rated=rows.filter(r=>r.passed===1&&/^[0-9]+([.][0-9]+)?$/.test(r.native_difficulty||'')&&
   ((r.platform_name==='Codeforces'&&r.difficulty_source==='codeforces')||(r.platform_name==='AtCoder'&&['atcoder_problems','atcoder_problems_experimental'].includes(r.difficulty_source))));
  const highest=rated.map(r=>Number(r.native_difficulty)).sort((a,b)=>b-a).slice(0,25);
  assert.equal(profile.total_count,rows.length);assert.equal(profile.rated_count,rated.length);assert.equal(profile.sample_count,highest.length);
  assert.equal(profile.ability_value,highest.length?Math.round(highest.reduce((a,b)=>a+b,0)/highest.length*10)/10:null);
 }
 for(const profile of data.tagAbility.filter(r=>r.sample_count>0).slice(0,3)){
  const response=await fetch(base+'/api/tags/'+profile.tag_id+'/ability?platform='+encodeURIComponent(profile.platform_name));assert.equal(response.status,200);
  const {problems}=await response.json();assert.equal(problems.length,profile.sample_count);assert.equal(new Set(problems.map(p=>p.problem_id)).size,problems.length);
  assert.equal(Math.round(problems.reduce((n,p)=>n+Number(p.rating),0)/problems.length*10)/10,profile.ability_value);
 }
 console.log('PASS: bilingual canonical tags, all platform-specific top-25 scores and selected problem lists match raw records');
}finally{await connection.end();}
