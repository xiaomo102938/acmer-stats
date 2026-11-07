import express from 'express';
import {problemTypeExpression} from './problem-type-query.js';
import {readFile} from 'node:fs/promises';
import {load} from 'cheerio';
import {decrypt} from './secrets.js';
import {qojFetch,qojTransport} from './qoj-network.js';

const origin='https://qoj.ac';
const duration=5*3600;
const timestamp=value=>Date.parse(value.replace(' ','T')+'+08:00')/1000;
const contestFromUrl=url=>url?.match(/\/contest\/(\d+)\/problem\//)?.[1];
const penalized=new Set(['WA','TL','TLE','ML','MLE','RE','RTE','OLE','OL','IL','PE','PARTIAL']);

export function parseQojVpProfile(html){
 const $=load(html);
 const heading=$('h2,h3,h4,h5').filter((_,el)=>/^Virtual Participations/i.test($(el).text().trim())).first();
 if(!heading.length)throw new Error('QOJ VP history unavailable');
 const expected=Number(heading.text().match(/\d+/)?.[0]);
 if(expected===0)return [];
 const next=heading.next();
 const table=next.is('table')?next:next.find('table').first();
 const rows=table.find('tr').has('td').toArray().map(el=>{
  const row=$(el),link=row.find('a').first();
  const contest=link.attr('href')?.match(/^\/contest\/(\d+)\/?$/)?.[1];
  const date=Date.parse(row.find('time').attr('datetime'));
  if(!contest||!link.text().trim()||!Number.isFinite(date))throw new Error('Invalid QOJ VP entry');
  const startsAt=new Date(date+8*3600*1000).toISOString().slice(0,19).replace('T',' ');
  return {contest,name:link.text().trim(),startsAt};
 });
 if(!rows.length||(Number.isFinite(expected)&&expected!==rows.length))throw new Error('Incomplete QOJ VP history');
 return rows;
}

async function fetchHtml(path,secret){
 const response=await qojFetch(origin+path,{...await qojTransport(),redirect:'manual',
  signal:AbortSignal.timeout(18000),headers:{Accept:'text/html',
   'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',Cookie:secret}});
 if(!response.ok)throw new Error('QOJ request unavailable');
 return response.text();
}

export async function initQojVpStore(pool){
 const schema=await readFile(new URL('../../sql/migrations/019_qoj_vp.sql',import.meta.url),'utf8');
 await pool.query(schema);
}

export async function importQojVpHistory(db,account,secret){
 const rows=parseQojVpProfile(await fetchHtml('/user/profile/'+encodeURIComponent(account.login_name),secret));
 if(rows.length)await db.query(
  'INSERT INTO qoj_vp_session (account_id,contest_key,contest_name,starts_at) VALUES ? '+
  'AS incoming ON DUPLICATE KEY UPDATE contest_name=incoming.contest_name',
  [rows.map(row=>[account.account_id,row.contest,row.name,row.startsAt])]);
 return rows.length;
}

export function scoreVp(session,submissions,roster=[],nextStart){
 const start=timestamp(session.starts_at);
 const end=Math.min(start+duration,nextStart?timestamp(nextStart):Infinity);
 const problems=new Map(roster.map(row=>[String(row.problemId),{
  key:String(row.problemId),name:row.name,index:row.index,tier:row.tier,url:row.url,attempts:0,wrong:0
 }]));
 for(const row of submissions){
  const submitted=timestamp(row.submitted_at);
  if(submitted<start||(nextStart&&submitted>=timestamp(nextStart)))continue;
  const key=String(row.source_key||'');
  if(!key||(!problems.has(key)&&contestFromUrl(row.problem_url)!==session.contest_key))continue;
  // A reused problem submitted through a different contest is not evidence for this VP.
  const contest=contestFromUrl(row.problem_url);
  if(contest&&contest!==session.contest_key)continue;
  if(!problems.has(key))problems.set(key,{key,name:row.problem_name,url:row.problem_url,attempts:0,wrong:0});
  const problem=problems.get(key);
  if(submitted>=end){
   if(Number(row.passed)===1)problem.afterAc??=row.submitted_at;
   continue;
  }
  problem.attempts++;
  if(problem.acSeconds!=null)continue;
  if(Number(row.passed)===1)problem.acSeconds=submitted-start;
  else{
   problem.lastVerdict=row.verdict;
   if(penalized.has(row.verdict))problem.wrong++;
  }
 }
 const items=[...problems.values()].map(problem=>({...problem,
  penalty:problem.acSeconds==null?null:Math.floor(problem.acSeconds/60)+20*problem.wrong}));
 return {items,solved:items.filter(p=>p.acSeconds!=null).length,
  penalty:items.reduce((sum,p)=>sum+(p.penalty??0),0),
  upsolved:items.filter(p=>p.acSeconds==null&&p.afterAc).length};
}

const sessionSource=' FROM qoj_vp_session v JOIN platform_account a ON a.account_id=CAST(v.account_id AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_0900_ai_ci '+
 'WHERE a.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)';

async function readContestRosters(){
 if(!process.env.QOJ_MEDAL_CATALOG)return new Map();
 try{
  const catalog=JSON.parse(await readFile(process.env.QOJ_MEDAL_CATALOG,'utf8'));
  return new Map(catalog.contests.map(row=>[String(row.id),row.problems??[]]));
 }catch{return new Map();}
}

export function qojVpRouter(pool){
 const router=express.Router();
 const boards=new Map();
 let syncing=false;
 router.post('/sync',async(_req,res)=>{
  if(syncing)return res.status(409).json({message:'正在同步 VP 记录。'});
  syncing=true;
  try{
   const [accounts]=await pool.query("SELECT a.account_id,a.login_name,a.login_pwd FROM platform_account a JOIN platform p USING(platform_id) WHERE p.platform_name='QOJ' AND a.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)");
   let count=0,successes=0;
   const failed=[];
   for(const account of accounts){
    const secret=decrypt(account.login_pwd);
    if(!secret)continue;
    try{count+=await importQojVpHistory(pool,account,secret);successes++;}
    catch{failed.push(account.login_name);}
   }
   if(!successes)return res.status(502).json({message:failed.length?'QOJ 暂时无法读取 VP 历史，请检查会话后重试。':'请先为 QOJ 账号配置 Cookie。'});
   res.json({count,failed});
  }finally{syncing=false;}
 });
 router.get('/',async(_req,res)=>{
  const [sessions]=await pool.query('SELECT v.*,a.login_name'+sessionSource+' ORDER BY v.starts_at DESC,v.contest_key');
  res.set('Cache-Control','no-store').json({sessions});
 });
 router.get('/summary',async(_req,res)=>{
  const [sessions]=await pool.query('SELECT v.*,a.login_name'+sessionSource+
   ' ORDER BY v.starts_at DESC,v.contest_key,v.account_id');
  if(!sessions.length)return res.json({sessions:[]});
  const [submissions]=await pool.query(
   "SELECT s.account_login,s.submitted_at,s.passed,s.verdict,pr.source_key,pr.problem_name,pr.problem_url FROM synced_submission s "+
   "JOIN platform p ON p.platform_id=s.platform_id JOIN problem pr ON pr.problem_id=s.problem_id "+
   "WHERE s.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1) AND p.platform_name='QOJ' AND s.submitted_at>=? "+
   "ORDER BY s.submitted_at,s.source_id+0,s.source_id",[sessions.at(-1).starts_at]);
  const [medals]=await pool.query('SELECT contest_key,problem_key,tier FROM qoj_contest_medal WHERE contest_key IN (?)',
   [[...new Set(sessions.map(session=>session.contest_key))]]);
  const rosters=await readContestRosters();
  const tiers=new Map(medals.map(row=>[row.contest_key+'|'+row.problem_key,row.tier]));
  const submissionsByLogin=new Map();
  for(const row of submissions){
   if(!submissionsByLogin.has(row.account_login))submissionsByLogin.set(row.account_login,[]);
   submissionsByLogin.get(row.account_login).push(row);
  }
  const nextStarts=new Map();
  const summary=sessions.map(session=>{
   const group=session.account_id+'|'+session.contest_key;
   const roster=rosters.get(session.contest_key)??[];
   const rosterKeys=new Set(roster.map(problem=>String(problem.problemId)));
   const {items,solved,penalty,upsolved}=scoreVp(session,submissionsByLogin.get(session.login_name)??[],roster,nextStarts.get(group));
   nextStarts.set(group,session.starts_at);
   const byTier={};
   for(const item of items){
    if(!rosterKeys.has(item.key))continue;
    const tier=tiers.get(session.contest_key+'|'+item.key)??'unrated';
    const counts=byTier[tier]??={total:0,solved:0,upsolved:0};
    counts.total++;
    if(item.acSeconds!=null)counts.solved++;
    else if(item.afterAc)counts.upsolved++;
   }
   return {...session,solved,penalty,upsolved,byTier,completeRoster:roster.length>0};
  });
  res.set('Cache-Control','no-store').json({sessions:summary});
 });
 router.get('/detail',async(req,res)=>{
  const {account,contest,start}=req.query;
  if(typeof account!=='string'||!/^[\da-f-]{36}$/i.test(account)||typeof contest!=='string'||!/^\d{1,20}$/.test(contest)||
    typeof start!=='string'||!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(start))return res.sendStatus(400);
  const [[session]]=await pool.execute('SELECT v.*,a.login_name,a.user_id'+sessionSource+
   ' AND v.account_id=? AND v.contest_key=? AND v.starts_at=?',[account,contest,start]);
  if(!session)return res.sendStatus(404);
  const [[next]]=await pool.execute('SELECT MIN(starts_at) AS starts_at FROM qoj_vp_session WHERE account_id=? AND contest_key=? AND starts_at>?',[account,contest,start]);
  const [submissions]=await pool.execute(
   "SELECT s.submitted_at,s.passed,s.verdict,pr.source_key,pr.problem_name,pr.problem_url FROM synced_submission s "+
   "JOIN platform p ON p.platform_id=s.platform_id JOIN problem pr ON pr.problem_id=s.problem_id "+
   "WHERE s.user_id=? AND p.platform_name='QOJ' AND s.account_login=? AND s.submitted_at>=? "+
   "ORDER BY s.submitted_at,s.source_id+0,s.source_id",[session.user_id,session.login_name,start]);
  let roster=(await readContestRosters()).get(contest)??[];
  const [medals]=await pool.execute('SELECT problem_key,tier FROM qoj_contest_medal WHERE contest_key=?',[contest]);
  const tiers=new Map(medals.map(row=>[row.problem_key,row.tier]));
  roster=roster.map(row=>({...row,tier:tiers.get(String(row.problemId))}));
  const score=scoreVp(session,submissions,roster,next.starts_at);
  const types=new Map();
  if(score.items.length){
   const expression=problemTypeExpression();
   const [rows]=await pool.query(
    'SELECT pr.source_key, '+expression.sql+' AS submission_type FROM problem pr '+
    "JOIN platform p ON p.platform_id=pr.platform_id WHERE p.platform_name='QOJ' AND pr.source_key IN (?)",
    [...expression.args,score.items.map(item=>item.key)]);
   for(const row of rows)types.set(row.source_key,row.submission_type);
  }
  for(const item of score.items){
   item.tier??=tiers.get(item.key);
   item.submission_type=types.get(item.key)??null;
  }
  res.set('Cache-Control','no-store').json({...score,completeRoster:roster.length>0});
 });
 router.get('/standings/:contest',async(req,res)=>{
  const contest=req.params.contest;
  if(!/^\d{1,20}$/.test(contest))return res.sendStatus(400);
  const [accounts]=await pool.execute(
   'SELECT a.login_pwd'+sessionSource+' AND v.contest_key=? ORDER BY v.starts_at DESC',[contest]);
  if(!accounts.length)return res.sendStatus(404);
  const secret=accounts.map(a=>decrypt(a.login_pwd)).find(Boolean);
  if(!secret)return res.status(502).json({message:'请配置 QOJ 会话后再比较榜单。'});
  try{
   let cached=boards.get(contest);
   if(!cached||cached.expires<Date.now()){
    const html=await fetchHtml('/contest/'+contest+'/standings',secret);
    cached={...parseQojStandings(html,contest),expires:Date.now()+600000};
    if(boards.size>=64)boards.delete(boards.keys().next().value);
    boards.set(contest,cached);
   }
   // Return anonymous scores only. Use the name internally to exclude the selected account.
   const login=typeof req.query.login==='string'?req.query.login:'';
   const entries=cached.entries.filter(row=>row.login!==login).map(({solved,seconds})=>({solved,seconds}));
   res.set('Cache-Control','no-store').json({entries});
  }catch{return res.status(502).json({message:'暂时无法读取可比较的 QOJ 榜单。'});}

 });
 return router;
}

export function parseQojStandings(html,contest){
 const $=load(html);
 const script=$('script').toArray().map(el=>$(el).text()).find(text=>/^standings=/m.test(text));
 if(!script||!/^standings_version=2;\s*$/m.test(script)||!/^contest_type="ICPC";\s*$/m.test(script)||
  !/^icpc_partial_scores=false;\s*$/m.test(script)||script.match(/^contest_id=(\d+);/m)?.[1]!==contest)
  throw new Error('Unsupported QOJ standings');
 const data=JSON.parse(script.match(/^standings=(\[.*\]);\s*$/m)?.[1]??'null');
 if(!Array.isArray(data)||!data.length)throw new Error('QOJ standings missing');
 const entries=data.map(row=>{
  const [score,seconds,team]=row;
  if(!Number.isInteger(score)||score<0||score%100||!Number.isInteger(seconds)||seconds<0||typeof team?.[0]!=='string')
   throw new Error('Invalid QOJ standings row');
  return {solved:score/100,seconds,login:team[0]};
 });
 return {entries};
}
