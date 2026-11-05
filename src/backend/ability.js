// acmer-cf-v1: transparent training heuristic, not an official rating prediction.
// AtCoder projection references Silver_Fox's user-rating converter, not a problem calibration.
export const ratingVersion='acmer-cf-v1';
export const luoguCF=[null,800,1000,1400,1800,2000,2200,2700,3200];
export function canonicalProblem(row){
 const key=row.source_key;
 if(key&&row.platform_name==='Codeforces')return 'cf:'+key.toUpperCase();
 if(key&&row.platform_name==='AtCoder')return 'at:'+key.toLowerCase();
 if(key&&row.platform_name==='洛谷'){
  if(/^CF\d+[A-Z]\d?$/i.test(key))return 'cf:'+key.slice(2).toUpperCase();
  if(/^AT_/i.test(key))return 'at:'+key.slice(3).toLowerCase();
 }
 return row.platform_name+':'+(key||row.problem_id);
}
export function estimateCF(row){
 const value=row.native_difficulty,valid=value!=null&&value!==''&&/^\d+(\.\d+)?$/.test(String(value));
 const n=valid?Number(value):null;
 if(row.platform_name==='Codeforces'&&row.difficulty_source==='codeforces'&&n>=800&&n<=4000)return {rating:n,method:'CF 官方题目 rating',confidence:'官方',estimated:false};
 if(row.platform_name==='AtCoder'&&/^atcoder_problems(?:_experimental)?$/.test(row.difficulty_source||'')&&valid&&n<=5000){
  return {rating:Math.round(Math.min(3900,Math.max(800,3900*(n+940)/5155))/100)*100,method:'AT 社区难度 → CF 实验换算 v1',confidence:'低',estimated:true};
 }
 if(row.platform_name==='洛谷'&&row.difficulty_source==='luogu'&&valid&&Number.isInteger(n)&&luoguCF[n]!=null)return {rating:luoguCF[n],method:'洛谷八档难度映射 v1',confidence:'低',estimated:true};
 // No numerical rating is invented from a platform name, solve count, or missing metadata.
 return {rating:null,method:'暂无可靠换算依据',confidence:'无',estimated:true};
}
export function ratedProblems(rows){
 const official=new Map();
 for(const r of rows){const e=estimateCF(r);if(!e.estimated&&e.rating!=null)official.set(canonicalProblem(r),e);}
 return rows.map(row=>{
  const key=canonicalProblem(row),exact=official.get(key),e=exact||estimateCF(row);
  return {...row,...e,canonical_key:key,method:exact&&row.platform_name!=='Codeforces'?'同源 CF 题目官方 rating':e.method,rating_version:ratingVersion};
 });
}
const dayMs=86400000;
export const shanghaiDay=(now=Date.now())=>Math.floor((now+8*3600000)/dayMs);

export async function readAcceptedDays(connection){
 const [rows]=await connection.query(`SELECT problem_id,DATEDIFF(DATE(submitted_at),'1970-01-01') AS day
  FROM synced_submission WHERE passed=1 AND user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)
  GROUP BY problem_id,day ORDER BY day DESC`);
 const days=new Map();
 for(const row of rows){
  if(!days.has(row.problem_id))days.set(row.problem_id,[]);
  days.get(row.problem_id).push(row.day);
 }
 return days;
}

function currentProfile(problems,limit,day){
 const dated=problems.filter(row=>row.lastAcceptedDay!=null);
 const scores=dated.map(row=>{
  const daysAfterGrace=Math.max(0,day-row.lastAcceptedDay-30);
  const penalty=250*(1-2**(-daysAfterGrace/365));
  return {age:day-row.lastAcceptedDay,score:Math.max(800,row.rating-penalty)};
 })
  .sort((a,b)=>b.score-a.score);
 const sample=scores.slice(0,limit);
 // A common weight factor cancels out in the average. Start at the newest age for numerical stability.
 const newestAge=Math.min(...sample.map(row=>row.age));
 let weightTotal=0,weightedScore=0;
 for(const row of sample){
  const weight=2**(-(row.age-newestAge)/183);
  weightTotal+=weight;
  weightedScore+=row.score*weight;
 }
 return {
  current_value:sample.length?Math.round(10*weightedScore/weightTotal)/10:null,
  current_equal_weight_value:sample.length?Math.round(10*sample.reduce((sum,row)=>sum+row.score,0)/sample.length)/10:null,
  current_sample_count:sample.length,current_dated_count:dated.length,
  current_unadjusted_value:sample.length?Math.round(10*dated.slice(0,limit).reduce((sum,row)=>sum+row.rating,0)/sample.length)/10:null
 };
}

export function abilityProfiles(rows,platform='全部平台',tagId=null,limit=25,recency){
 const rated=ratedProblems(rows);
 const filtered=rated.filter(r=>(platform==='全部平台'||r.platform_name===platform)&&(!tagId||r.tag_id===tagId));
 const groups=new Map();
 for(const row of filtered){
  if(!groups.has(row.tag_id))groups.set(row.tag_id,{tag_id:row.tag_id,tag_name:row.tag_name,display_name:row.display_name,platform_name:platform,items:new Map()});
  const map=groups.get(row.tag_id).items,old=map.get(row.canonical_key);
  const acceptedDay=recency?.days.get(row.problem_id)?.find(day=>day<=recency.day);
  if(!old)map.set(row.canonical_key,recency?{...row,lastAcceptedDay:acceptedDay}:{...row});
  else{
   // Merge completion; prefer official evidence and then a rated representative.
   const passed=Math.max(old.passed,row.passed);
   const representative=(old.estimated&&!row.estimated)||(old.rating==null&&row.rating!=null)?{...row}:old;
   representative.passed=passed;
   if(recency)representative.lastAcceptedDay=acceptedDay==null?old.lastAcceptedDay:Math.max(acceptedDay,old.lastAcceptedDay??acceptedDay);
   map.set(row.canonical_key,representative);
  }
 }
 return [...groups.values()].map(g=>{
  const all=[...g.items.values()],passed=all.filter(r=>r.passed===1),valid=passed.filter(r=>r.rating!=null);
  valid.sort((a,b)=>b.rating-a.rating||a.canonical_key.localeCompare(b.canonical_key));
  const problems=valid.slice(0,limit),n=problems.length;
  return {tag_id:g.tag_id,tag_name:g.tag_name,display_name:g.display_name,platform_name:platform,total_count:all.length,passed_count:passed.length,rated_count:valid.length,
   sample_count:n,ability_value:n?Math.round(problems.reduce((s,p)=>s+p.rating,0)/n*10)/10:null,
   ...(recency?currentProfile(valid,limit,recency.day):{}),
   min_difficulty:n?problems[n-1].rating:null,max_difficulty:n?problems[0].rating:null,
   estimated_count:problems.filter(r=>r.estimated).length,sample_limit:limit,sample_status:n===limit?'满'+limit+'题':n?'样本不足':'暂无有效评分',problems};
 }).sort((a,b)=>(b.sample_count===limit)-(a.sample_count===limit)||(b.ability_value??-1)-(a.ability_value??-1)||b.sample_count-a.sample_count||a.display_name.localeCompare(b.display_name));
}
export function overallAbility(rows,recency){
 const profile=abilityProfiles(rows.map(r=>({...r,tag_id:'overall',tag_name:'overall',display_name:'综合能力参考'})),'全部平台',null,150,recency)[0];
 return profile||{sample_count:0,sample_limit:150,ability_value:null,estimated_count:0,rated_count:0,passed_count:0,total_count:0,min_difficulty:null,max_difficulty:null,sample_status:'暂无有效评分',problems:[]};
}
export async function readProblemRows(connection){
 const [rows]=await connection.query(`SELECT pr.*,r.passed,r.solve_date,p.platform_name FROM v_problem_progress r
 JOIN problem pr ON pr.problem_id=r.problem_id JOIN platform p ON p.platform_id=pr.platform_id
 WHERE r.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)`);
 return rows;
}
export async function readAbilityRows(connection){
 const [rows]=await connection.query(`SELECT r.user_id,r.passed,r.solve_date,pr.problem_id,pr.problem_name,pr.problem_url,pr.source_key,pr.native_difficulty,pr.difficulty_source,
  p.platform_name,pt.tag_id,t.tag_name,COALESCE(t.display_name,t.tag_name) AS display_name
  FROM v_problem_progress r JOIN problem pr ON pr.problem_id=r.problem_id JOIN platform p ON p.platform_id=pr.platform_id
  JOIN problem_tag pt ON pt.problem_id=pr.problem_id JOIN tag t ON t.tag_id=pt.tag_id
  WHERE r.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)`);
 return rows;
}
export function skillSubtreeCounts(rows, nodes) {
 const parents = new Map(nodes.map(node => [node.id, node.parent]));
 const byPlatform = new Map();
 for (const row of rows) {
  if (row.passed !== 1 || !parents.has(row.tag_name)) continue;
  const key = canonicalProblem(row);
  for (const platform of ['全部平台', row.platform_name]) {
   if (!byPlatform.has(platform)) byPlatform.set(platform, new Map());
   const counts = byPlatform.get(platform);
   for (let tag = row.tag_name; parents.has(tag); tag = parents.get(tag)) {
    if (!counts.has(tag)) counts.set(tag, new Set());
    counts.get(tag).add(key);
   }
  }
 }
 return Object.fromEntries([...byPlatform].map(([platform, counts]) =>
  [platform, Object.fromEntries([...counts].map(([tag, problems]) => [tag, problems.size]))]
 ));
}
