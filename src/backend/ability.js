import {canonicalProblem,ratedProblems} from './ability-difficulty.js';

const dayMs=86400000;
export const shanghaiDay=(now=Date.now())=>Math.floor((now+8*3600000)/dayMs);

export const abilityMinimums={topic:20,specialty:125,all:250};
const sampleTarget=(count,minimum)=>Math.max(minimum,Math.ceil(count*15/100));
const roundScore=score=>Math.round(score*10)/10;

function currentProfile(problems,minimum,day,includeSamples=false){
 const dated=problems.filter(row=>row.lastAcceptedDay!=null);
 const limit=sampleTarget(dated.length,minimum);
 const scores=dated.map(row=>{
  const daysAfterGrace=Math.max(0,day-row.lastAcceptedDay-20);
  const penalty=250*(1-2**(-daysAfterGrace/365));
  return {problem:row,age:day-row.lastAcceptedDay,score:Math.max(800,row.rating-penalty)};
 })
  .sort((a,b)=>b.score-a.score);
 const sample=scores.slice(0,limit);
 // A common weight factor cancels out in the average. Start at the newest age for numerical stability.
 const newestAge=sample.reduce((youngest,row)=>Math.min(youngest,row.age),Infinity);
 let weightTotal=0,weightedScore=0;
 for(const row of sample){
  const weight=2**(-(row.age-newestAge)/183);
  weightTotal+=weight;
  weightedScore+=row.score*weight;
 }
 return {
  // Normalize the weights over real problems, then count missing slots as zero.
  current_value:sample.length?roundScore(weightedScore/weightTotal*sample.length/limit):null,
  current_equal_weight_value:sample.length?roundScore(sample.reduce((sum,row)=>sum+row.score,0)/limit):null,
  ...(includeSamples?{currentProblems:sample.map(({problem,score,age})=>({
   ...problem,adjusted_rating:roundScore(score),
   last_accepted_date:new Date(problem.lastAcceptedDay*dayMs).toISOString().slice(0,10),
   relative_weight:2**(-(age-newestAge)/183)
  }))}:{}),
  current_sample_count:sample.length,current_sample_limit:limit,current_dated_count:dated.length,
  current_unadjusted_value:sample.length?roundScore(dated.slice(0,limit).reduce((sum,row)=>sum+row.rating,0)/limit):null
 };
}

export function abilityProfiles(rows,platform='全部平台',tagId=null,minimum=abilityMinimums.topic,recency){
 const rated=ratedProblems(rows);
 const filtered=rated.filter(row=>(platform==='全部平台'||row.platform_name===platform)&&(!tagId||row.tag_id===tagId));
 return profilesFromRatedRows(filtered,platform,minimum,recency);
}

export function abilityProfilesByPlatform(rows,recency){
 // Resolve mirror ratings against all platforms before grouping the rows.
 const rated=ratedProblems(rows);
 const byPlatform=new Map();
 for(const row of rated){
  if(!byPlatform.has(row.platform_name))byPlatform.set(row.platform_name,[]);
  byPlatform.get(row.platform_name).push(row);
 }
 const scopes=[['全部平台',rated],...byPlatform];
 return scopes.flatMap(([platform,platformRows])=>profilesFromRatedRows(platformRows,platform,abilityMinimums.topic,recency));
}

function profilesFromRatedRows(rows,platform,minimum,recency){
 const groups=new Map();
 for(const row of rows){
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
  const limit=sampleTarget(valid.length,minimum);
  const problems=valid.slice(0,limit),n=problems.length;
  return {tag_id:g.tag_id,tag_name:g.tag_name,display_name:g.display_name,platform_name:platform,total_count:all.length,passed_count:passed.length,rated_count:valid.length,
   sample_count:n,ability_value:roundScore(problems.reduce((s,p)=>s+p.rating,0)/limit),
   ...(recency?currentProfile(valid,minimum,recency.day,recency.includeSamples):{}),
   min_difficulty:n?problems[n-1].rating:null,max_difficulty:n?problems[0].rating:null,
   estimated_count:problems.filter(r=>r.estimated).length,sample_limit:limit,sample_status:n===limit?'满'+limit+'题':'补 '+(limit-n)+' 道零分',problems};
 }).sort((a,b)=>(b.ability_value??-1)-(a.ability_value??-1)||b.sample_count-a.sample_count||a.display_name.localeCompare(b.display_name));
}
export function overallAbility(rows,recency,minimum=abilityMinimums.all){
 const profile=abilityProfiles(rows.map(r=>({...r,tag_id:'overall',tag_name:'overall',display_name:'综合能力参考'})),'全部平台',null,minimum,recency)[0];
 return profile||{sample_count:0,sample_limit:minimum,ability_value:0,...(recency?currentProfile([],minimum,recency.day):{}),estimated_count:0,rated_count:0,passed_count:0,total_count:0,min_difficulty:null,max_difficulty:null,sample_status:'补 '+minimum+' 道零分',problems:[]};
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
