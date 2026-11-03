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
app.use(express.json({limit:'24kb'}));
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
app.use('/api/accounts',accountRouter(pool));
app.get('/api/dashboard', async (_req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION READ ONLY');
    const read = async sql => (await connection.query(sql))[0];
    const overview = await read('SELECT * FROM v_user_overview');
    const platforms = await read('SELECT * FROM v_platform_stats ORDER BY total_count DESC');
    const tags = await read('SELECT * FROM v_tag_stats ORDER BY total_count DESC, pass_rate DESC');
    const tagAbility = await read(`SELECT * FROM v_tag_ability WHERE user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)
 ORDER BY (sample_count=25) DESC,ability_value DESC,sample_count DESC,display_name`);
    const difficulty = await read('SELECT * FROM v_difficulty_stats');
    const nativeDifficulty = await read(`SELECT p.platform_name,pr.difficulty,pr.native_difficulty,COUNT(r.record_id) AS total_count
      FROM record r JOIN problem pr ON pr.problem_id=r.problem_id
      JOIN platform p ON p.platform_id=pr.platform_id
      GROUP BY p.platform_name,pr.difficulty,pr.native_difficulty`);
    const monthly = await read('SELECT * FROM v_monthly_trend ORDER BY solve_month');
    const daily = await read(`SELECT DATE(submitted_at) AS day,COUNT(*) AS submission_count,
      SUM(passed=1) AS accepted_count,COUNT(DISTINCT problem_id) AS problem_count
      FROM synced_submission
      WHERE submitted_at>=DATE_SUB(CURDATE(),INTERVAL 6 DAY) AND submitted_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)
      GROUP BY DATE(submitted_at) ORDER BY day`);
    const [weekSummary] = await read(`SELECT COUNT(DISTINCT problem_id) AS problem_count
      FROM synced_submission WHERE submitted_at>=DATE_SUB(CURDATE(),INTERVAL 6 DAY)
      AND submitted_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)`);
    const [clock] = await read('SELECT CURRENT_DATE() AS server_date');
    const recent = await read(`SELECT pr.problem_name, p.platform_name, pr.difficulty, pr.native_difficulty, pr.difficulty_source, r.passed, r.submit_count, r.solve_date
      FROM record r JOIN problem pr ON pr.problem_id=r.problem_id
      JOIN platform p ON p.platform_id=pr.platform_id
      ORDER BY r.solve_date DESC,r.record_id LIMIT 8`);
    await connection.commit();
    res.set('Cache-Control', 'no-store').json({ overview: overview[0] || null, platforms, tags, difficulty, monthly, recent, nativeDifficulty, tagAbility, daily, weekProblems:weekSummary.problem_count, serverDate:clock.server_date });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
});
app.get('/api/tags/:id/ability',async(req,res)=>{
 const platform=String(req.query.platform||'');
 if(!['Codeforces','AtCoder'].includes(platform))return res.status(400).json({message:'当前仅支持 CF 官方难度和 AtCoder Problems 估计难度。'});
 const connection=await pool.getConnection();
 try{
  const [[tag]]=await connection.execute('SELECT tag_id,COALESCE(display_name,tag_name) AS display_name FROM tag WHERE tag_id=?',[req.params.id]);
  if(!tag)return res.status(404).json({message:'题型不存在。'});
  const [problems]=await connection.execute(`SELECT pr.problem_id,pr.problem_name,pr.problem_url,
   CAST(pr.native_difficulty AS DECIMAL(10,2)) AS rating,pr.difficulty_source,r.solve_date
   FROM record r JOIN problem pr ON pr.problem_id=r.problem_id
   JOIN platform p ON p.platform_id=pr.platform_id JOIN problem_tag pt ON pt.problem_id=pr.problem_id
   WHERE r.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1) AND pt.tag_id=? AND p.platform_name=? AND r.passed=1
   AND pr.native_difficulty REGEXP '^[0-9]+([.][0-9]+)?$'
   AND ((p.platform_name='Codeforces' AND pr.difficulty_source='codeforces')
    OR (p.platform_name='AtCoder' AND pr.difficulty_source IN ('atcoder_problems','atcoder_problems_experimental')))
   ORDER BY CAST(pr.native_difficulty AS DECIMAL(10,2)) DESC,pr.problem_id LIMIT 25`,[tag.tag_id,platform]);
  res.set('Cache-Control','no-store').json({tag,platform,problems});
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
  const [[user]]=await connection.query('SELECT user_id FROM user ORDER BY user_id LIMIT 1');
  const [platformRows]=await connection.query('SELECT platform_name FROM platform ORDER BY platform_name');
  let days=[],yearRows=[];
  if(user){
   [days]=await connection.execute(`SELECT DATE(s.submitted_at) AS day,p.platform_name,COUNT(*) AS submission_count,
    SUM(s.passed=1) AS accepted_count,COUNT(DISTINCT s.problem_id) AS problem_count,
    COUNT(DISTINCT IF(s.passed=1,s.problem_id,NULL)) AS accepted_problem_count
    FROM synced_submission s JOIN platform p ON p.platform_id=s.platform_id
    WHERE s.user_id=? AND s.submitted_at>=? AND s.submitted_at<?
    AND s.submitted_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)
    GROUP BY DATE(s.submitted_at),p.platform_name ORDER BY day,p.platform_name`,
    [user.user_id,year+'-01-01',(year+1)+'-01-01']);
   [yearRows]=await connection.execute('SELECT DISTINCT YEAR(submitted_at) AS year FROM synced_submission WHERE user_id=? AND submitted_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)',[user.user_id]);
  }
  const years=[...new Set([Number(clock.year),year,...yearRows.map(r=>Number(r.year))])].sort((a,b)=>b-a);
  await connection.commit();
  res.set('Cache-Control','no-store').json({year,years,serverDate:clock.day,platforms:platformRows.map(p=>p.platform_name),days});
 }catch(error){await connection.rollback();throw error;}
 finally{connection.release();}
});

app.use('/api', (_req,res) => res.status(404).json({message:'接口不存在'}));
app.use(express.static(path.join(root, 'dist')));
app.use((error,_req,res,_next) => {
  if(error.status) return res.status(error.status).json({message:error.message});
  console.error('Request failed:', error.code || error.message);
  res.status(503).json({message:'暂时无法读取数据，请检查数据库连接后重试。'});
});
const port=Number(process.env.PORT || 3000);
await pool.query("UPDATE platform_account SET sync_status='error',sync_message='上次同步被服务重启中断，请重新同步。' WHERE sync_status='running'");
const server=app.listen(port,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:'+port));
async function close() { server.close(async()=>{await pool.end();process.exit(0);}); }
process.on('SIGINT',close);
process.on('SIGTERM',close);
