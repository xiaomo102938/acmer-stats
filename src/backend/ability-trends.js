import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import express from 'express';
import {abilityProfiles,overallAbility,ratingVersion,readAbilityRows,readProblemRows,readAcceptedDays,shanghaiDay} from './ability.js';
import {readSkillSettings,specialtyAbility} from './skill-settings.js';
import {mergeSkillRows,specialtyKeys} from '../shared/skill-settings.js';

const historyLimit=500;
const readJSON=value=>typeof value==='string'?JSON.parse(value):value;

function scopeId(keys,config){
 const aliases=Object.entries(config.aliases).filter(([,target])=>keys.has(target)).sort();
 return createHash('sha256').update(JSON.stringify([[...keys].sort(),aliases])).digest('hex');
}

function metric(profile,sampleLimit,recency){
 if(recency)return {score:profile?.current_value??null,count:profile?.current_sample_count??0,limit:sampleLimit};
 return {score:profile?.ability_value??null,count:profile?.sample_count??0,limit:sampleLimit};
}

export function snapshotMetrics(problems,tags,config,recency){
 const keys=specialtyKeys(config);
 const specialties=[...config.specialties].sort();
 const profiles=new Map(abilityProfiles(mergeSkillRows(tags,config),'全部平台',null,25,recency).map(row=>[row.tag_id,row]));
 const name=key=>config.names[key]||key;
 return {
  version:recency?ratingVersion+'-decay183':ratingVersion,
  all:metric(overallAbility(problems,recency),150,recency),
  specialty:{...metric(specialtyAbility(problems,tags,config,'specialty',recency),150,recency),
   scope:scopeId(keys,config),names:specialties.map(name),includeDescendants:config.includeDescendants},
  topics:specialties.map(key=>({key,name:name(key),scope:scopeId(new Set([key]),config),...metric(profiles.get(key),25,recency)}))
 };
}

// Lock the owner first so concurrent syncs and settings saves cannot duplicate a snapshot.
export async function captureAbilitySnapshot(connection,origin){
 await connection.beginTransaction();
 try{
  const [[user]]=await connection.query('SELECT user_id FROM user ORDER BY user_id LIMIT 1 FOR UPDATE');
  if(user){
   const [[last]]=await connection.execute('SELECT metrics FROM ability_snapshot WHERE user_id=? ORDER BY snapshot_id DESC LIMIT 1',[user.user_id]);
   const {config}=await readSkillSettings(connection);
   const metrics=snapshotMetrics(await readProblemRows(connection),await readAbilityRows(connection),config);
   if(!last||!isDeepStrictEqual(readJSON(last.metrics),metrics)){
    await connection.execute('INSERT INTO ability_snapshot(user_id,observed_at,origin,metrics) VALUES(?,UTC_TIMESTAMP(3),?,?)',
     [user.user_id,origin,JSON.stringify(metrics)]);
   }
  }
  await connection.commit();
 }catch(error){await connection.rollback();throw error;}
}

export function abilityTrendsRouter(pool){
 const router=express.Router();
 router.get('/',async(req,res)=>{
  if(req.query.mode==='current'){
   const connection=await pool.getConnection();
   try{
    const {config}=await readSkillSettings(connection);
    const problems=await readProblemRows(connection),tags=await readAbilityRows(connection);
    const days=await readAcceptedDays(connection),today=shanghaiDay();
    const snapshots=Array.from({length:53},(_,index)=>{
     const day=today-(52-index)*7;
     return {at:new Date(day*86400000+16*3600000-1).toISOString(),...snapshotMetrics(problems,tags,config,{days,day})};
    });
    return res.set('Cache-Control','no-store').json({snapshots,historyLimit});
   }finally{connection.release();}
  }
  let rows;
  try{
   [rows]=await pool.query(`SELECT snapshot_id,observed_at,origin,metrics FROM ability_snapshot
    WHERE user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)
    ORDER BY snapshot_id DESC LIMIT ?`,[historyLimit]);
  }catch(error){
   if(error.code==='ER_NO_SUCH_TABLE')return res.status(503).json({message:'能力快照表尚未建立，请应用迁移 013_ability_snapshot.sql 后重启服务。'});
   throw error;
  }
  const snapshots=rows.reverse().map(row=>({id:row.snapshot_id,
   at:row.observed_at.replace(' ','T')+'Z',origin:row.origin,...readJSON(row.metrics)}));
  res.set('Cache-Control','no-store').json({snapshots,historyLimit});
 });
 return router;
}
