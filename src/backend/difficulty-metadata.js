// AtCoder Problems display correction follows the maintainer's clipDifficulty formula:
// https://github.com/kenkoooo/AtCoderProblems/blob/master/atcoder-problems-frontend/src/utils/index.ts
import {submissionTypeFromTags} from '../shared/problem-submission-type.js';
const cache=new Map(),ttl=6*60*60*1000;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function json(url){
 const response=await fetch(url,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'acmer-stats/1.0 (personal coursework)'}});
 if(!response.ok)throw new Error('Difficulty source HTTP '+response.status);
 return response.json();
}
export function atCoderDifficulty(model){
 const raw=model?.difficulty;
 if(typeof raw!=='number'||!Number.isFinite(raw))return null;
 return String(Math.round(raw>=400?raw:400*Math.exp((raw-400)/400)));
}
export function inferProblemKey(platform,name){
 if(platform==='Codeforces')return name.match(/^Codeforces\s+(\d+[A-Za-z]\d?)(?:\s|$)/)?.[1]||null;
 if(platform==='AtCoder'){
  const direct=name.match(/^AtCoder\s+([a-z0-9]+_[a-z0-9]+)(?:\s|$)/i);
  if(direct)return direct[1].toLowerCase();
  const legacy=name.match(/^AtCoder\s+([A-Za-z]+)(\d+)([A-Za-z]\d?)(?:\s|$)/);
  if(legacy)return (legacy[1]+legacy[2]+'_'+legacy[3]).toLowerCase();
 }
 return null;
}
async function download(platform){
 const map=new Map();
 if(platform==='Codeforces'){
  const payload=await json('https://codeforces.com/api/problemset.problems');
  if(payload.status!=='OK'||!Array.isArray(payload.result?.problems))throw new Error('Invalid Codeforces catalog');
  for(const p of payload.result.problems){
   if(p.contestId==null||!p.index)continue;
   const key=p.contestId+p.index;
   map.set(key,{native:Number.isFinite(p.rating)?String(p.rating):null,source:'codeforces',title:'Codeforces '+key+' '+p.name,
    tags:Array.isArray(p.tags)?p.tags:[],url:'https://codeforces.com/problemset/problem/'+p.contestId+'/'+p.index});
  }
 }else if(platform==='AtCoder'){
  const models=await json('https://kenkoooo.com/atcoder/resources/problem-models.json');
  if(!models||typeof models!=='object'||Array.isArray(models))throw new Error('Invalid AtCoder models');
  await pause(1200);
  const problems=await json('https://kenkoooo.com/atcoder/resources/problems.json');
  if(!Array.isArray(problems))throw new Error('Invalid AtCoder catalog');
  for(const p of problems){
   const model=models[p.id];
   map.set(p.id,{native:atCoderDifficulty(model),
    source:model?.is_experimental?'atcoder_problems_experimental':'atcoder_problems',
    title:'AtCoder '+p.id+' '+p.name});
  }
 }
 return map;
}
export async function getDifficultyMetadata(platform){
 const entry=cache.get(platform);
 if(entry&&entry.expires>Date.now())return entry.value;
 if(entry?.pending)return entry.pending;
 const pending=download(platform);
 cache.set(platform,{...entry,pending});
 try{const value=await pending;cache.set(platform,{value,expires:Date.now()+ttl});return value;}
 catch(error){cache.delete(platform);throw error;}
}
export async function applyDifficultyMetadata(connection,platformId,platform,metadata){
 const [rows]=await connection.execute('SELECT problem_id,source_key,problem_name,submission_type FROM problem WHERE platform_id=?',[platformId]);
 let updated=0;
 for(const row of rows){
  const key=row.source_key||inferProblemKey(platform,row.problem_name),meta=metadata.get(key);
  const taggedType=platform==='Codeforces'&&meta?.tags?.length?submissionTypeFromTags(meta.tags)??'standard':null;
  const type=taggedType==='spj'?'standard':taggedType;
  if(type&&type!==row.submission_type){
   await connection.execute('UPDATE problem SET submission_type=? WHERE problem_id=?',[type,row.problem_id]);
  }
  // A missing or unavailable upstream rating must not erase a rating already stored.
  if(meta?.native==null)continue;
  await connection.execute('UPDATE problem SET native_difficulty=?,difficulty_source=?,problem_name=? WHERE problem_id=?',
   [meta.native,meta.source,Array.from(meta.title).slice(0,100).join(''),row.problem_id]);
  updated++;
 }
 return updated;
}
