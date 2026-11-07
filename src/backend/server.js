import {problemTypesRouter} from './problem-types.js';
import {getDifficultyMetadata} from './difficulty-metadata.js';
import {skillSettingsRouter,readSkillSettings,mergeSkillRows,specialtyAbility} from './skill-settings.js';
import {applyLeetcodeTotals} from './leetcode.js';
import {ratingRouter} from './ratings.js';
import {trendRouter} from './trends.js';
import {abilityTrendsRouter,captureAbilitySnapshot} from './ability-trends.js';
import {submissionRouter} from './submissions.js';
import {practiceRouter} from './practice.js';
import {abilityProfiles,abilityProfilesByPlatform,skillSubtreeCounts,shanghaiDay} from './ability.js';
import {ratedProblems,ratingVersion} from './ability-difficulty.js';
import {initQojMedalStore,readQojImportStatus,readQojMedalCounts} from './qoj-medals.js';
import {readAbilityRows,readProblemRows,readAcceptedDays} from './ability-store.js';
import express from 'express';
import {accountRouter} from './accounts.js';
import mysql from 'mysql2/promise';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'acmer_stats',
  waitForConnections: true, connectionLimit: 5, timezone: '+08:00',
  decimalNumbers: true, dateStrings: true
});
const app = express();
app.disable('x-powered-by');
app.use(express.json({limit:'192kb'}));
app.use('/api',(req,res,next)=>{
 if(!['GET','HEAD','OPTIONS'].includes(req.method)){
  if(req.get('X-Acmer-Request')!=='1') return res.status(403).json({message:'请求来源校验失败，请从本站操作。'});
  const origin=req.get('Origin');
  if(origin){
   try { const host=new URL(origin).hostname; if(!['127.0.0.1','localhost','[::1]'].includes(host)) throw new Error(); }
   catch { return res.status(403).json({message:'不允许跨站写入。'}); }
  }
 }
 next();
});
async function saveAbilitySnapshot(connection,origin){
 try{await captureAbilitySnapshot(connection,origin);}
 catch(error){console.error('Ability snapshot failed:',error.code||error.name);}
}
app.get('/api/health',async(_req,res)=>{
 res.set('Cache-Control','no-store');
 try{
  await pool.query({sql:'SELECT 1',timeout:2500});
  res.json({database:'ok'});
 }catch{
  res.status(503).json({database:'error'});
 }
});
app.use('/api/skill-settings',skillSettingsRouter(pool,saveAbilitySnapshot));
app.use('/api/accounts',accountRouter(pool,saveAbilitySnapshot));
app.use('/api/ability/trends',abilityTrendsRouter(pool,path.join(root,'.cache','current-ability-trend.json')));
app.get('/api/qoj-medals/status',async(_req,res)=>{
 res.set('Cache-Control','no-store').json(await readQojImportStatus(pool));
});
app.use('/api/submissions',submissionRouter(pool));
app.use('/api/problem-types',problemTypesRouter(pool));
app.use('/api/practice',practiceRouter(pool));
app.use('/api/trends',trendRouter(pool));
app.use('/api/ratings',ratingRouter(pool));
app.get('/api/dashboard', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION READ ONLY');
    const read = async sql => (await connection.query(sql))[0];
    const overview = await read('SELECT * FROM v_user_overview');
    const platforms = await read('SELECT * FROM v_platform_stats ORDER BY total_count DESC');
    const platformSnapshots=await read(`SELECT a.user_id,p.platform_name,a.login_name,s.passed_count,s.attempted_count,s.activity_days,s.profile_passed_count,s.profile_attempted_count,s.observed_at
 FROM platform_snapshot s JOIN platform_account a ON a.account_id=s.account_id JOIN platform p ON p.platform_id=a.platform_id
 WHERE a.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)`);
    applyLeetcodeTotals(overview,platforms,platformSnapshots);
    const daily = await read(`SELECT DATE(submitted_at) AS day,COUNT(*) AS submission_count,
      SUM(passed=1) AS accepted_count,COUNT(DISTINCT problem_id) AS problem_count
      FROM synced_submission
      WHERE submitted_at>=DATE_SUB(CURDATE(),INTERVAL 6 DAY) AND submitted_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)
      GROUP BY DATE(submitted_at) ORDER BY day`);
    const [weekSummary] = await read(`SELECT COUNT(DISTINCT problem_id) AS problem_count
      FROM synced_submission WHERE submitted_at>=DATE_SUB(CURDATE(),INTERVAL 6 DAY)
      AND submitted_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)`);
    const [clock] = await read('SELECT CURRENT_DATE() AS server_date');
    const ratingRows=await readProblemRows(connection);
    const nowcoderCounts=new Map();
    for(const row of ratingRows){
      if(row.platform_name!=='牛客')continue;
      const score=row.difficulty_source==='nowcoder'?Number(row.native_difficulty):null;
      nowcoderCounts.set(score,(nowcoderCounts.get(score)??0)+1);
    }
    const nowcoderDifficulty=[...nowcoderCounts].map(([score,total_count])=>({score,total_count}));
    if(req.query.view==='overview'){
      const difficultyCounts=new Map();
      for(const row of ratedProblems(ratingRows)){
        const key=JSON.stringify([row.platform_name,row.rating]);
        const group=difficultyCounts.get(key);
        if(group)group.total_count++;
        else difficultyCounts.set(key,{platform_name:row.platform_name,cf_rating:row.rating,total_count:1});
      }
      await connection.commit();
      return res.set('Cache-Control','no-store').json({
        overview:overview[0]||null,platforms,unifiedDifficulty:[...difficultyCounts.values()],nowcoderDifficulty,
        daily,weekProblems:weekSummary.problem_count,serverDate:clock.server_date
      });
    }
    const qojMedals=await readQojMedalCounts(connection,ratingRows);
    const unifiedDifficulty=ratedProblems(ratingRows).map(r=>({platform_name:r.platform_name,cf_rating:r.rating,estimated:r.estimated,total_count:1}));
    const tags = await read('SELECT * FROM v_tag_stats ORDER BY total_count DESC, pass_rate DESC');
    const skillSettings=await readSkillSettings(connection);
    const abilityRows=mergeSkillRows(await readAbilityRows(connection),skillSettings.config);
    const recency={days:await readAcceptedDays(connection),day:shanghaiDay()};
    const tagAbility=abilityProfilesByPlatform(abilityRows,recency).map(({problems,...row})=>row);
    const difficulty = await read('SELECT * FROM v_difficulty_stats');
    const nativeDifficulty = await read(`SELECT p.platform_name,pr.difficulty,pr.native_difficulty,COUNT(r.record_id) AS total_count
      FROM v_problem_progress r JOIN problem pr ON pr.problem_id=r.problem_id
      JOIN platform p ON p.platform_id=pr.platform_id
      GROUP BY p.platform_name,pr.difficulty,pr.native_difficulty`);
    const {problems:overallProblems,...overall}=specialtyAbility(ratingRows,abilityRows,skillSettings.config,'specialty',recency);
    const monthly = await read('SELECT * FROM v_monthly_trend ORDER BY solve_month');
    const recent = await read(`SELECT pr.problem_name, p.platform_name, pr.difficulty, pr.native_difficulty, pr.difficulty_source,pr.source_key,pr.problem_id, r.passed, r.submit_count, r.solve_date
      FROM record r JOIN problem pr ON pr.problem_id=r.problem_id
      JOIN platform p ON p.platform_id=pr.platform_id
      ORDER BY r.solve_date DESC,r.record_id LIMIT 8`);
    await connection.commit();
    res.set('Cache-Control', 'no-store').json({ overview: overview[0] || null, platforms, tags, difficulty, monthly, recent:ratedProblems(recent), nativeDifficulty, unifiedDifficulty, nowcoderDifficulty, qojMedals, ratingVersion, overallAbility:overall, tagAbility, skillCounts:skillSubtreeCounts(abilityRows,skillSettings.config.nodes), skillConfig:skillSettings.config, platformSnapshots, daily, weekProblems:weekSummary.problem_count, serverDate:clock.server_date });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
});
app.get('/api/ability/overall',async(req,res)=>{
 const connection=await pool.getConnection();
 try{const state=await readSkillSettings(connection);res.set('Cache-Control','no-store').json({...specialtyAbility(await readProblemRows(connection),await readAbilityRows(connection),state.config,req.query.scope==='all'?'all':'specialty',{days:await readAcceptedDays(connection),day:shanghaiDay()}),ratingVersion});}
 finally{connection.release();}
});
app.get('/api/tags/:id/ability',async(req,res)=>{
 const platform=String(req.query.platform||'全部平台');
 const connection=await pool.getConnection();
 try{
  const state=await readSkillSettings(connection);
  const rows=mergeSkillRows(await readAbilityRows(connection),state.config);
  const tag=rows.find(r=>r.tag_id===req.params.id);
  if(!tag)return res.status(404).json({message:'题型不存在。'});
  if(platform!=='全部平台'&&!rows.some(r=>r.platform_name===platform))return res.status(400).json({message:'该平台暂无题型数据。'});
  const current=req.query.sample==='current';
  const recency=current?{days:await readAcceptedDays(connection),day:shanghaiDay(),includeSamples:true}:undefined;
  const profile=abilityProfiles(rows,platform,tag.tag_id,undefined,recency)[0];
  res.set('Cache-Control','no-store').json({tag,platform,ratingVersion,problems:(current?profile?.currentProblems:profile?.problems)||[]});
 }finally{connection.release();}
});

app.get('/api/activity',async(req,res)=>{
 const connection=await pool.getConnection();
 try{
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  await connection.query('START TRANSACTION READ ONLY');
  const [[clock]]=await connection.query('SELECT CURRENT_DATE() AS day,YEAR(CURDATE()) AS year');
  const year=req.query.year===undefined?Number(clock.year):Number(req.query.year);
  if((req.query.year!==undefined&&!/^\d{4}$/.test(String(req.query.year)))||!Number.isInteger(year)||year<1970||year>Number(clock.year)){
   await connection.rollback();return res.status(400).json({message:'请选择有效的历史年份或当年。'});
  }
  const mode=req.query.year===undefined?'rolling':'year';
  const first=new Date(clock.day+'T00:00:00Z');first.setUTCDate(first.getUTCDate()-364);
  const next=new Date(clock.day+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);
  const rangeStart=mode==='rolling'?first.toISOString().slice(0,10):year+'-01-01';
  const rangeEnd=mode==='rolling'?clock.day:year+'-12-31';
  const endExclusive=mode==='rolling'?next.toISOString().slice(0,10):(year+1)+'-01-01';
  const [[user]]=await connection.query('SELECT user_id FROM user ORDER BY user_id LIMIT 1');
  const [platformRows]=await connection.query('SELECT platform_name FROM platform ORDER BY platform_name');
  let days=[],yearRows=[],activities=[],activityYears=[];
  if(user){
   [days]=await connection.execute(`SELECT DATE(s.submitted_at) AS day,p.platform_name,COUNT(*) AS submission_count,
    SUM(s.passed=1) AS accepted_count,COUNT(DISTINCT s.problem_id) AS problem_count,
    COUNT(DISTINCT IF(s.passed=1,s.problem_id,NULL)) AS accepted_problem_count
    FROM synced_submission s JOIN platform p ON p.platform_id=s.platform_id
    WHERE s.user_id=? AND s.submitted_at>=? AND s.submitted_at<?
    AND s.submitted_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)
    GROUP BY DATE(s.submitted_at),p.platform_name ORDER BY day,p.platform_name`,
    [user.user_id,rangeStart,endExclusive]);
   [yearRows]=await connection.execute('SELECT DISTINCT YEAR(submitted_at) AS year FROM synced_submission WHERE user_id=? AND submitted_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)',[user.user_id]);
  }
  if(user){
   [activities]=await connection.execute(`SELECT a.activity_day AS day,p.platform_name,SUM(a.activity_count) AS activity_count
    FROM platform_daily_activity a JOIN platform p ON p.platform_id=a.platform_id
    WHERE a.user_id=? AND a.activity_day>=? AND a.activity_day<? AND a.activity_day<=CURDATE()
    GROUP BY a.activity_day,p.platform_name`,[user.user_id,rangeStart,endExclusive]);
   [activityYears]=await connection.execute('SELECT DISTINCT YEAR(activity_day) AS year FROM platform_daily_activity WHERE user_id=? AND activity_day<=CURDATE()',[user.user_id]);
  }
  const combined=new Map(days.map(row=>[row.day+'|'+row.platform_name,{...row,activity_count:0,has_submission_data:true,has_activity_data:false}]));
  for(const row of activities){
   const key=row.day+'|'+row.platform_name,old=combined.get(key)||{day:row.day,platform_name:row.platform_name,submission_count:0,accepted_count:0,problem_count:0,accepted_problem_count:0,has_submission_data:false};
   combined.set(key,{...old,activity_count:Number(row.activity_count),has_activity_data:true});
  }
  days=[...combined.values()].sort((a,b)=>a.day.localeCompare(b.day)||a.platform_name.localeCompare(b.platform_name));
  const years=[...new Set([Number(clock.year),year,...yearRows.map(r=>Number(r.year)),...activityYears.map(r=>Number(r.year))])].sort((a,b)=>b-a);
  await connection.commit();
  res.set('Cache-Control','no-store').json({year,years,mode,rangeStart,rangeEnd,serverDate:clock.day,platforms:platformRows.map(p=>p.platform_name),activityPlatforms:[...new Set(activities.map(r=>r.platform_name))],days});
 }catch(error){await connection.rollback();throw error;}
 finally{connection.release();}
});

app.use('/api', (_req,res) => res.status(404).json({message:'接口不存在'}));
let difficultyPrewarmStarted=false;
app.get('/',(_req,res,next)=>{
 if(!difficultyPrewarmStarted){
  res.once('finish',()=>{
   if(difficultyPrewarmStarted||(res.statusCode!==200&&res.statusCode!==304))return;
   difficultyPrewarmStarted=true;
   // Sync shares these in-flight downloads through the existing catalog cache.
   for(const platform of ['Codeforces','AtCoder'])void getDifficultyMetadata(platform).catch(()=>{});
  });
 }
 next();
});
app.use(express.static(path.join(root, 'dist')));
app.use((error,_req,res,_next) => {
  if(error.status) return res.status(error.status).json({message:error.message});
  console.error('Request failed:', error.code || error.message);
  res.status(503).json({message:'暂时无法读取数据，请检查数据库连接后重试。'});
});
const port=Number(process.env.PORT || 3000);
await pool.query("UPDATE platform_account SET sync_status='error',sync_message='上次同步被服务重启中断，请重新同步。' WHERE sync_status='running'");
const startupConnection=await pool.getConnection();
try{await saveAbilitySnapshot(startupConnection,'startup');}finally{startupConnection.release();}
const stopQojMedalImport=await initQojMedalStore(pool,process.env.QOJ_MEDAL_CATALOG);
const server=app.listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+port));
async function close() { stopQojMedalImport(); server.close(async()=>{await pool.end();process.exit(0);}); }
process.on('SIGINT',close);
process.on('SIGTERM',close);
