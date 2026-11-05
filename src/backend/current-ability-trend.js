import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {shanghaiDay} from './ability.js';
import {readAbilityRows,readProblemRows,readAcceptedDays} from './ability-store.js';
import {readSkillSettings} from './skill-settings.js';

const dayMs=86400000;
const weekCount=52;

function trendDays(today){
 // Shanghai calendar days are counted from Thursday, 1970-01-01.
 const lastSunday=today-((today+4)%7);
 const priorSunday=lastSunday===today?lastSunday-7:lastSunday;
 return [...Array.from({length:weekCount},(_,i)=>priorSunday-(weekCount-1-i)*7),today];
}

async function readInputs(pool){
 const connection=await pool.getConnection();
 try{
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await connection.query('START TRANSACTION READ ONLY');
  const {config}=await readSkillSettings(connection);
  const problems=await readProblemRows(connection);
  const tags=await readAbilityRows(connection);
  const days=await readAcceptedDays(connection);
  await connection.commit();
  return {config,problems,tags,days};
 }catch(error){
  await connection.rollback();
  throw error;
 }finally{connection.release();}
}

async function saveCache(path,value){
 const temporary=path+'.'+randomUUID()+'.tmp';
 try{
  await mkdir(dirname(path),{recursive:true});
  await writeFile(temporary,JSON.stringify(value));
  await rename(temporary,path);
 }finally{await rm(temporary,{force:true}).catch(()=>{});}
}

export function createCurrentTrendCache(pool,path,version,score){
 let cached=null,pending=null;

 async function load(){
  const {config,problems,tags,days}=await readInputs(pool);
  // A backfilled AC, difficulty change or topic edit can also change past scores.
  const fingerprint=createHash('sha256').update(JSON.stringify([
   version,config,problems,tags,[...days].sort(([a],[b])=>String(a).localeCompare(String(b)))
  ])).digest('hex');
  if(!cached){
   try{cached=JSON.parse(await readFile(path,'utf8'));}catch{}
  }
  const today=shanghaiDay();
  const dates=trendDays(today);
  if(cached?.fingerprint===fingerprint&&cached.today===today&&Array.isArray(cached.snapshots))return cached.snapshots;
  const previous=new Map(cached?.fingerprint===fingerprint&&Array.isArray(cached.snapshots)?
   cached.snapshots.map(point=>[point.at,point]):[]);
  const snapshots=dates.map(day=>{
   const at=new Date(day*dayMs+16*3600000-1).toISOString();
   return previous.get(at)??{at,...score(problems,tags,config,{days,day})};
  });
  cached={fingerprint,today,snapshots};
  // The cache is disposable. A disk error should not prevent the trend from loading.
  await saveCache(path,cached).catch(()=>{});
  return snapshots;
 }

 return ()=>{
  if(!pending)pending=load().finally(()=>{pending=null;});
  return pending;
 };
}
