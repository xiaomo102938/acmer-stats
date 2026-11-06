import {parseLuoguPayload,LuoguError} from './luogu.js';
import {randomUUID} from 'node:crypto';
import {submissionTypeFromTags} from '../shared/problem-submission-type.js';
import {tagDefinition} from './tags.js';
const headers={'x-lentille-request':'content-only',Referer:'https://www.luogu.com.cn/','User-Agent':'acmer-stats/1.0 personal coursework'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let dictionary;
async function get(url,secret){
 let response,text;
 try{
  response=await fetch(url,{headers:{...headers,...(secret?{Cookie:secret}:{})},redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(response.ok)text=await response.text();
 }catch{
  throw new LuoguError('洛谷题型元数据请求失败，下次同步可继续补充。');
 }
 if(!response.ok)throw new LuoguError('洛谷题目元数据 HTTP '+response.status+'，已保留先前数据。');
 return parseLuoguPayload(text);
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
 return {tags:[...names],submissionType:submissionTypeFromTags(problem.tags.map(id=>tags.get(id)?.name)),native:problem.difficulty!=null&&Number.isInteger(native)&&native>=0&&native<=8?String(native):null};
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
 if(!dictionary){const body=await get('https://www.luogu.com.cn/_lfe/tags',secret);if(!Array.isArray(body.tags))throw new LuoguError('洛谷标签字典不可用。');dictionary=new Map(body.tags.map(t=>[t.id,t]));}
 let updated=0;
 for(const row of rows){
  await progress(updated,rows.length);await pause(4000);
  const meta=problemMetadata(await get('https://www.luogu.com.cn/problem/'+encodeURIComponent(row.source_key),secret),row.source_key,dictionary);
  await saveProblemMetadata(connection,row.problem_id,meta);updated++;
 }
 await progress(updated,rows.length);return {updated,total:rows.length};
}
