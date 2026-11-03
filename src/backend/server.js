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
    const difficulty = await read('SELECT * FROM v_difficulty_stats');
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
    const recent = await read(`SELECT pr.problem_name, p.platform_name, pr.difficulty, r.passed, r.submit_count, r.solve_date
      FROM record r JOIN problem pr ON pr.problem_id=r.problem_id
      JOIN platform p ON p.platform_id=pr.platform_id
      ORDER BY r.solve_date DESC,r.record_id LIMIT 8`);
    await connection.commit();
    res.set('Cache-Control', 'no-store').json({ overview: overview[0] || null, platforms, tags, difficulty, monthly, recent, daily, weekProblems:weekSummary.problem_count, serverDate:clock.server_date });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
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
