import express from 'express';
import {abilityProfiles,canonicalProblem} from './ability.js';
import {getDifficultyMetadata,inferProblemKey} from './difficulty-metadata.js';
import {readSkillSettings} from './skill-settings.js';
import {mergeSkillRows,resolveTag,specialtyKeys} from '../shared/skill-settings.js';

const pageSize=20;
const recommendationRadius=200;
const owner='(SELECT user_id FROM user ORDER BY user_id LIMIT 1)';
const problemKey=row=>canonicalProblem({...row,source_key:row.source_key||inferProblemKey(row.platform_name,row.problem_name)});

export function retryProblems(latest,progress,tagRows,filter){
 const solved=new Set(progress.filter(p=>p.passed===1).map(problemKey));
 const matching=filter&&new Set(tagRows.filter(row=>filter.has(row.tag_name)).map(problemKey));
 const seen=new Set();
 return latest.filter(row=>{
  const key=problemKey(row);
  if(solved.has(key)||seen.has(key)||(matching&&!matching.has(key)))return false;
  seen.add(key);
  return true;
 });
}

export function recommendProblems(catalog,progress,config,tag,target){
 const seen=new Set(progress.map(problemKey));
 const rows=[];
 for(const [key,problem] of catalog){
  if(!problem.url||problem.native==null||seen.has('cf:'+key.toUpperCase()))continue;
  const rating=Number(problem.native),distance=Math.abs(rating-target);
  if(distance>recommendationRadius||!problem.tags.some(value=>resolveTag(value,config)===tag))continue;
  rows.push({problem_id:key,problem_name:problem.title,problem_url:problem.url,rating,distance});
 }
 return rows.sort((a,b)=>a.distance-b.distance||a.rating-b.rating||a.problem_id.localeCompare(b.problem_id));
}

async function readPractice(pool,includeAttempts){
 const connection=await pool.getConnection();
 try{
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await connection.query('START TRANSACTION READ ONLY');
  const {config,catalog}=await readSkillSettings(connection);
  const [progress]=await connection.query(`SELECT pr.problem_id,pr.problem_name,pr.problem_url,pr.source_key,
   pr.native_difficulty,pr.difficulty_source,p.platform_name,r.passed,r.solve_date
   FROM v_problem_progress r JOIN problem pr ON pr.problem_id=r.problem_id JOIN platform p ON p.platform_id=pr.platform_id
   WHERE r.user_id=${owner}`);
  const [tags]=await connection.query(`SELECT pt.problem_id,t.tag_name,COALESCE(t.display_name,t.tag_name) AS display_name
   FROM v_problem_progress r JOIN problem_tag pt ON pt.problem_id=r.problem_id JOIN tag t ON t.tag_id=pt.tag_id
   WHERE r.user_id=${owner}`);
  const byId=new Map(progress.map(row=>[row.problem_id,row]));
  const tagRows=mergeSkillRows(tags.map(row=>({...byId.get(row.problem_id),...row})),config);
  let latest=[];
  if(includeAttempts){
   [latest]=await connection.query(`WITH attempts AS (
    SELECT problem_id,submitted_at,verdict,submission_id,
     ROW_NUMBER() OVER (PARTITION BY problem_id ORDER BY submitted_at DESC,submission_id DESC) AS position
    FROM synced_submission WHERE user_id=${owner} AND passed=0
   )
   SELECT pr.problem_id,pr.problem_name,pr.problem_url,pr.source_key,p.platform_name,a.submitted_at,a.verdict
   FROM attempts a JOIN problem pr ON pr.problem_id=a.problem_id JOIN platform p ON p.platform_id=pr.platform_id
   WHERE a.position=1 ORDER BY a.submitted_at DESC,a.submission_id DESC`);
  }
  await connection.commit();
  return {config,catalog,progress,tagRows,latest};
 }catch(error){await connection.rollback();throw error;}
 finally{connection.release();}
}

function paginate(rows,requested){
 const total=rows.length,pages=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(requested,pages);
 return {items:rows.slice((page-1)*pageSize,page*pageSize),page,pages,total};
}

export function practiceRouter(pool){
 const router=express.Router();
 router.get('/',async(req,res)=>{
  const {mode='retry',tag,page='1',target}=req.query;
  if(!['retry','recommend'].includes(mode)||typeof page!=='string'||!/^[1-9]\d{0,7}$/.test(page)||
   (tag!==undefined&&(typeof tag!=='string'||tag.length>120))||
   (target!==undefined&&(typeof target!=='string'||!/^\d{3,4}$/.test(target)||Number(target)<800||Number(target)>4000))){
   return res.status(400).json({message:'题单筛选参数无效。'});
  }
  const {config,catalog,progress,tagRows,latest}=await readPractice(pool,mode==='retry');
  const options=catalog.filter(({key})=>!Object.hasOwn(config.aliases,key)).map(({key,name})=>({key,name:config.names[key]||name}));
  const selected=tag===undefined?undefined:resolveTag(tag,config);
  const known=options.some(({key})=>key===selected);
  res.set('Cache-Control','no-store');
  if(mode==='retry'){
   const filter=selected==='@specialty'?specialtyKeys(config):known?new Set([selected]):null;
   return res.json({...paginate(retryProblems(latest,progress,tagRows,filter),Number(page)),
    options,selected:filter?selected:'',hasSpecialties:config.specialties.length>0});
  }

  const profiles=abilityProfiles(tagRows);
  const key=known?selected:config.specialties[0]||profiles.find(p=>p.sample_count>0)?.tag_id||options[0]?.key;
  const profile=profiles.find(p=>p.tag_id===key);
  const sampleCount=profile?.sample_count??0;
  const ability=sampleCount?Math.round(profile.problems.reduce((sum,row)=>sum+row.rating,0)/sampleCount):null;
  const desired=target===undefined?ability:Number(target);
  const info={options,selected:key,ability,sampleCount,target:desired,radius:recommendationRadius};
  let recommendations=[],sourceError='';
  if(key&&desired!==null){
   let cfCatalog;
   try{cfCatalog=await getDifficultyMetadata('Codeforces');}
   catch{sourceError='暂时无法读取 Codeforces 题库，请稍后重试。';}
   if(cfCatalog)recommendations=recommendProblems(cfCatalog,progress,config,key,desired);
  }
  return res.json({...paginate(recommendations,Number(page)),...info,sourceError});
 });
 return router;
}
