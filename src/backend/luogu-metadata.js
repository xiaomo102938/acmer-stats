import {parseLuoguPayload,LuoguError} from './luogu.js';
import {randomUUID} from 'node:crypto';
import {submissionTypeFromTags} from '../shared/problem-submission-type.js';
import {tagDefinition} from './tags.js';
const headers={'x-lentille-request':'content-only',Referer:'https://www.luogu.com.cn/','User-Agent':'acmer-stats/1.0 personal coursework'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let dictionary;
let problemRequests=Promise.resolve();
async function get(url,secret){
 let response,text;
 try{
  response=await fetch(url,{headers:{...headers,...(secret?{Cookie:secret}:{})},redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(response.ok)text=await response.text();
 }catch{
  throw new LuoguError('洛谷题型元数据请求失败，下次同步可继续补充。');
 }
 if(!response.ok)throw Object.assign(new LuoguError('洛谷题目元数据 HTTP '+response.status+'，已保留先前数据。'),{status:response.status});
 return parseLuoguPayload(text);
}
async function readTagDictionary(secret){
 if(!dictionary){
  const body=await get('https://www.luogu.com.cn/_lfe/tags',secret);
  if(!Array.isArray(body.tags))throw new LuoguError('洛谷标签字典不可用。');
  dictionary=new Map(body.tags.map(tag=>[tag.id,tag]));
 }
 return dictionary;
}
function readProblem(key,secret){
 // Share the pacing between historical backfill and ordinary account sync.
 const request=problemRequests.then(async()=>{
  await pause(4000);
  return get('https://www.luogu.com.cn/problem/'+encodeURIComponent(key),secret);
 });
 problemRequests=request.catch(()=>{});
 return request;
}
export function problemMetadata(payload,key,tags){
 const problem=(payload.data||payload.currentData||payload).problem;
 if(!problem||String(problem.pid).toUpperCase()!==key||!Array.isArray(problem.tags))throw new LuoguError('洛谷题目元数据不完整。');
 const names=new Set();
 for(const id of problem.tags){
  let tag=tags.get(id);const seen=new Set();
  // Roll up only explicit upstream algorithm taxonomy parents, never source/year labels.
  while(tag&&tag.type===2&&!seen.has(tag.id)){
   seen.add(tag.id);names.add(tag.name.replace(/^\uFEFF/,''));tag=tags.get(tag.parent);
  }
 }
 const native=Number(problem.difficulty);
 return {tags:[...names],submissionType:submissionTypeFromTags(problem.tags.map(id=>tags.get(id)?.name))??'standard',native:problem.difficulty!=null&&Number.isInteger(native)&&native>=0&&native<=8?String(native):null};
}
export async function saveProblemMetadata(connection,id,meta){
 await connection.beginTransaction();
 try{
  for(const name of meta.tags){
   const d=tagDefinition(name);
   await connection.execute('INSERT INTO tag(tag_id,tag_name,display_name) VALUES(?,?,?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name)',[randomUUID(),d.key.slice(0,120),d.display.slice(0,180)]);
   const [[tag]]=await connection.execute('SELECT tag_id FROM tag WHERE tag_name=?',[d.key.slice(0,120)]);
   await connection.execute('INSERT IGNORE INTO problem_tag(problem_id,tag_id) VALUES(?,?)',[id,tag.tag_id]);
  }
  await connection.execute("UPDATE problem SET native_difficulty=COALESCE(?,native_difficulty),difficulty_source='luogu',submission_type=?,metadata_checked_at=NOW() WHERE problem_id=?",[meta.native,meta.submissionType,id]);
  await connection.commit();
 }catch(e){await connection.rollback();throw e;}
}
export async function enrichLuoguProblems(connection,platformId,secret='',progress=()=>{}){
 const [rows]=await connection.execute("SELECT problem_id,source_key FROM problem WHERE platform_id=? AND source_key IS NOT NULL AND (metadata_checked_at IS NULL OR metadata_checked_at<DATE_SUB(NOW(),INTERVAL 30 DAY)) ORDER BY source_key",[platformId]);
 if(!rows.length)return {updated:0,total:0};
 const tags=await readTagDictionary(secret);
 let updated=0;
 for(const row of rows){
  await progress(updated,rows.length);
  const meta=problemMetadata(await readProblem(row.source_key,secret),row.source_key,tags);
  await saveProblemMetadata(connection,row.problem_id,meta);updated++;
 }
 await progress(updated,rows.length);return {updated,total:rows.length};
}

export async function backfillLuoguSubmissionTypes(pool){
 const [rows]=await pool.query(`SELECT pr.problem_id,pr.source_key FROM problem pr
  JOIN platform p ON p.platform_id=pr.platform_id
  WHERE p.platform_name=? AND pr.source_key IS NOT NULL
   AND pr.metadata_checked_at IS NOT NULL AND pr.submission_type IS NULL
   AND EXISTS (SELECT 1 FROM synced_submission s WHERE s.problem_id=pr.problem_id)
  ORDER BY pr.source_key`,['洛谷']);
 if(!rows.length)return;
 const tags=await readTagDictionary('');
 for(const row of rows){
  let meta;
  try{
   meta=problemMetadata(await readProblem(row.source_key,''),row.source_key,tags);
  }catch(error){
   if(error.status===404)continue;
   throw error;
  }
  await pool.execute('UPDATE problem SET submission_type=? WHERE problem_id=? AND submission_type IS NULL',
   [meta.submissionType,row.problem_id]);
 }
}
