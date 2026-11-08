import { activityRouter } from './activity.js';
import { dashboardRouter } from './dashboard.js';
import {problemTypesRouter} from './problem-types.js';
import {getDifficultyMetadata} from './difficulty-metadata.js';
import {skillSettingsRouter,readSkillSettings,mergeSkillRows,specialtyAbility} from './skill-settings.js';
import {ratingRouter} from './ratings.js';
import {trendRouter} from './trends.js';
import {abilityTrendsRouter,captureAbilitySnapshot} from './ability-trends.js';
import {initQojVpStore,qojVpRouter} from './qoj-vp.js';
import {submissionRouter} from './submissions.js';
import {practiceRouter} from './practice.js';
import {abilityProfiles,shanghaiDay} from './ability.js';
import {ratingVersion} from './ability-difficulty.js';
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
app.get('/api/qoj-medals',async(_req,res)=>{
 const connection=await pool.getConnection();
 try{
  const qojMedals=await readQojMedalCounts(connection,await readProblemRows(connection));
  res.set('Cache-Control','no-store').json({qojMedals});
 }finally{connection.release();}
});
app.get('/api/qoj-medals/status',async(_req,res)=>{
 res.set('Cache-Control','no-store').json(await readQojImportStatus(pool));
});
app.use('/api/qoj-vp',qojVpRouter(pool));
app.use('/api/submissions',submissionRouter(pool));
app.use('/api/problem-types',problemTypesRouter(pool));
app.use('/api/practice',practiceRouter(pool));
app.use('/api/trends',trendRouter(pool));
app.use('/api/ratings',ratingRouter(pool));
app.use('/api/dashboard', dashboardRouter(pool));
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

app.use('/api/activity', activityRouter(pool));

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
await initQojVpStore(pool);
const stopQojMedalImport=await initQojMedalStore(pool,process.env.QOJ_MEDAL_CATALOG);
const server=app.listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+port));
async function close() { stopQojMedalImport(); server.close(async()=>{await pool.end();process.exit(0);}); }
process.on('SIGINT',close);
process.on('SIGTERM',close);
