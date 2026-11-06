import {decrypt} from './secrets.js';
import {setTimeout as pause} from 'node:timers/promises';
import express from 'express';
import {readQojType} from './qoj-metadata.js';
import {readNowcoderType} from './nowcoder-metadata.js';
import {readLuoguType} from './luogu-metadata.js';
import {atcoderTypeReader,leetcodeTypeReader} from './contest-problem-types.js';
import {knownProblemType,problemTypeExpression} from './problem-type-query.js';

const ownerProblems='EXISTS (SELECT 1 FROM synced_submission s WHERE s.problem_id=pr.problem_id AND s.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1))';
const fromProblems=' FROM problem pr JOIN platform p USING(platform_id) WHERE '+ownerProblems;
const sources=new Map([
 ['QOJ',readQojType],['洛谷',readLuoguType]
]);

export function problemTypesRouter(pool){
 const router=express.Router();
 const cooldowns=new Map();
 let backgroundController;
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
  if(job.status!=='running')startScan();
  res.status(202).json(job);
 });
 router.put('/auto/qoj',(req,res)=>{
  if(typeof req.body?.enabled!=='boolean')return res.status(400).json({message:'请选择是否开启后台补判。'});
  if(req.body.enabled){
   if(job.status==='running'&&!job.background)return res.status(409).json({message:'请等待当前自动判断结束。'});
   if(job.status!=='running')startScan(new AbortController());
  }else{
   backgroundController?.abort();
  }
  res.json(job);
 });

 function startScan(controller){
  backgroundController=controller;
  job={status:'running',background:!!controller,resumeAt:null,total:0,done:0,identified:0,standard:0,skipped:0,errors:0,limited:[]};
  void classify(controller?.signal).then(()=>{job.status='done';}).catch(error=>{
   if(controller?.signal.aborted){job.status='stopped';return;}
   console.warn('Problem type scan failed:',error.message);
   job.status='error';
  }).finally(()=>{job.resumeAt=null;backgroundController=undefined;});
 }

 async function classify(signal){
  const expression=problemTypeExpression();
  const [rows]=await pool.query('SELECT pr.problem_id,pr.source_key,pr.problem_url,p.platform_name'+
   fromProblems+(signal?" AND p.platform_name='QOJ'":'')+' AND '+expression.sql+"='unknown' ORDER BY p.platform_name,pr.problem_id",expression.args);
  job.total=rows.length;
  const limited=new Set();
  let nowcoderCookies;
  async function loadNowcoderCookies(){
   if(nowcoderCookies)return nowcoderCookies;
   const [accounts]=await pool.execute("SELECT a.login_pwd FROM platform_account a JOIN platform p USING(platform_id) "+
    "WHERE a.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1) AND p.platform_name=? AND a.login_pwd IS NOT NULL",['牛客']);
   nowcoderCookies=accounts.map(account=>decrypt(account.login_pwd)).filter(Boolean);
   return nowcoderCookies;
  }
  const readers=new Map([...sources,
   ['牛客',row=>readNowcoderType(row,loadNowcoderCookies)],
   ['AtCoder',atcoderTypeReader()],['LeetCode',leetcodeTypeReader(rows)]
  ]);
  for(let index=0;index<rows.length;){
   const row=rows[index];
   const platform=row.platform_name;
   if(signal){
    const remaining=(cooldowns.get(platform)??0)-Date.now();
    job.resumeAt=remaining>0?Date.now()+remaining:null;
    await pause(Math.min(Math.max(remaining,15000),3600000),undefined,{signal});
    if((cooldowns.get(platform)??0)>Date.now())continue;
    job.resumeAt=null;
    const [pending]=await pool.execute('SELECT 1 FROM problem WHERE problem_id=? AND submission_type IS NULL AND manual_submission_type IS NULL',[row.problem_id]);
    signal.throwIfAborted();
    if(!pending.length){index++;job.done++;job.skipped++;continue;}
   }
   let retry=false;
   try{
    if((cooldowns.get(platform)??0)>Date.now()){
     limited.add(platform);
     job.skipped++;
     continue;
    }
    const readType=readers.get(platform);
    if(!readType){
     job.skipped++;
     continue;
    }
    const type=await readType(row,signal);
    signal?.throwIfAborted();
    if(type){
     const [result]=await pool.execute('UPDATE problem SET submission_type=?,metadata_checked_at=NOW() WHERE problem_id=? AND submission_type IS NULL AND manual_submission_type IS NULL',[type,row.problem_id]);
     job.identified+=result.affectedRows;
     if(type==='standard')job.standard+=result.affectedRows;
    }
   }catch(error){
    signal?.throwIfAborted();
    if(error.status===429){
     const hint=error.retryAfter;
     const ms=/^\d+$/.test(hint)?Number(hint)*1000:Date.parse(hint)-Date.now();
     cooldowns.set(platform,Date.now()+Math.max(300000,Number.isFinite(ms)?ms:0));
     limited.add(platform);
     retry=!!signal;
    }
    if(!retry)job.errors++;
   }finally{
    if(!retry&&!signal?.aborted){index++;job.done++;}
    job.limited=[...limited];
   }
  }
 }
 return router;
}
