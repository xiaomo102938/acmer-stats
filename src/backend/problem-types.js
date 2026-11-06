import express from 'express';
import {readQojType} from './qoj-metadata.js';
import {readNowcoderType} from './nowcoder-metadata.js';
import {readLuoguType} from './luogu-metadata.js';
import {knownProblemType,problemTypeExpression} from './problem-type-query.js';

const ownerProblems='EXISTS (SELECT 1 FROM synced_submission s WHERE s.problem_id=pr.problem_id AND s.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1))';
const fromProblems=' FROM problem pr JOIN platform p USING(platform_id) WHERE '+ownerProblems;
const sources=new Map([
 ['QOJ',readQojType],['牛客',readNowcoderType],['洛谷',readLuoguType]
]);

export function problemTypesRouter(pool){
 const router=express.Router();
 const cooldowns=new Map();
 let job={status:'idle',total:0,done:0,identified:0,standard:0,skipped:0,errors:0,limited:[]};
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next();});

 router.get('/',async(req,res)=>{
  const {q='',unknown='',page='1'}=req.query;
  if(typeof q!=='string'||q.length>100||!['','1'].includes(unknown)||typeof page!=='string'||!/^[1-9]\d{0,6}$/.test(page)){
   return res.status(400).json({message:'搜索或分页参数无效。'});
  }
  const expression=problemTypeExpression();
  const conditions=[],args=[];
  if(q.trim()){
   conditions.push(' AND (LOCATE(?,LOWER(pr.problem_name)) OR LOCATE(?,LOWER(pr.source_key)))');
   const term=q.trim().toLowerCase();
   args.push(term,term);
  }
  if(unknown){
   conditions.push(' AND '+expression.sql+"='unknown'");
   args.push(...expression.args);
  }
  const source=fromProblems+conditions.join('');
  const [[{total}]]=await pool.query('SELECT COUNT(*) AS total'+source,args);
  const pages=Math.max(1,Math.ceil(Number(total)/20));
  const current=Math.min(Number(page),pages);
  const [items]=await pool.query('SELECT pr.problem_id,pr.problem_name,pr.source_key,pr.problem_url,pr.manual_submission_type,p.platform_name,'+
   expression.sql+' AS type'+source+' ORDER BY p.platform_name,pr.problem_name,pr.problem_id LIMIT 20 OFFSET ?',
   [...expression.args,...args,(current-1)*20]);
  res.json({items,page:current,pages,total:Number(total)});
 });

 router.put('/:id',async(req,res)=>{
  const type=req.body?.type;
  if(type!==null&&!knownProblemType(type))return res.status(400).json({message:'请选择有效题型。'});
  const [result]=await pool.execute('UPDATE problem pr SET manual_submission_type=? WHERE pr.problem_id=? AND '+ownerProblems,[type,req.params.id]);
  if(!result.affectedRows)return res.status(404).json({message:'未找到这道题。'});
  res.json({ok:true});
 });

 router.get('/auto',(_req,res)=>res.json(job));
 router.post('/auto',(_req,res)=>{
  if(job.status==='running')return res.status(202).json(job);
  job={status:'running',total:0,done:0,identified:0,standard:0,skipped:0,errors:0,limited:[]};
  void classify().catch(error=>{
   console.warn('Problem type scan failed:',error.message);
   job.status='error';
  });
  res.status(202).json(job);
 });

 async function classify(){
  const expression=problemTypeExpression();
  const [rows]=await pool.query('SELECT pr.problem_id,pr.source_key,pr.problem_url,p.platform_name,'+
   'EXISTS (SELECT 1 FROM problem_tag pt WHERE pt.problem_id=pr.problem_id) AS has_tags'+
   fromProblems+' AND '+expression.sql+"='unknown' ORDER BY p.platform_name,pr.problem_id",expression.args);
  job.total=rows.length;
  const limited=new Set();
  for(const row of rows){
   const platform=row.platform_name;
   try{
    if((cooldowns.get(platform)??0)>Date.now()){
     limited.add(platform);
     job.skipped++;
     continue;
    }
    const readType=sources.get(platform);
    const localStandard=platform==='Codeforces'&&row.has_tags;
    if(!localStandard&&!readType){
     job.skipped++;
     continue;
    }
    const type=localStandard?'standard':await readType(row);
    if(type){
     const [result]=await pool.execute('UPDATE problem SET submission_type=?,metadata_checked_at=NOW() WHERE problem_id=? AND submission_type IS NULL AND manual_submission_type IS NULL',[type,row.problem_id]);
     job.identified+=result.affectedRows;
     if(type==='standard')job.standard+=result.affectedRows;
    }
   }catch(error){
    job.errors++;
    if(error.status===429){
     const hint=error.retryAfter;
     const ms=/^\d+$/.test(hint)?Number(hint)*1000:Date.parse(hint)-Date.now();
     cooldowns.set(platform,Date.now()+Math.max(300000,Number.isFinite(ms)?ms:0));
     limited.add(platform);
    }
   }finally{
    job.done++;
    job.limited=[...limited];
   }
  }
  job.status='done';
 }
 return router;
}
