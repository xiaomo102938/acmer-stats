import express from 'express';
export function submissionRouter(pool){
 const router=express.Router();
 router.get('/',async(req,res)=>{
  const rawPage=String(req.query.page||'1'),rawSize=String(req.query.pageSize||'25');
  if(!/^[1-9]\d{0,7}$/.test(rawPage)||!['10','25','50','100'].includes(rawSize))return res.status(400).json({message:'分页参数无效。'});
  const pageSize=Number(rawSize),connection=await pool.getConnection();
  try{
   await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
   await connection.query('START TRANSACTION READ ONLY');
   const [[user]]=await connection.query('SELECT user_id FROM user ORDER BY user_id LIMIT 1');
   if(!user){await connection.commit();return res.json({items:[],page:1,pageSize,total:0,pages:1});}
   const [[count]]=await connection.execute('SELECT COUNT(*) AS n FROM synced_submission WHERE user_id=?',[user.user_id]);
   const total=Number(count.n),pages=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(Number(rawPage),pages);
   const [items]=await connection.query(`SELECT s.submission_id,s.source_id,s.account_login,s.submitted_at,s.passed,s.verdict,
    p.platform_name,pr.problem_name,pr.problem_url
    FROM synced_submission s JOIN problem pr ON pr.problem_id=s.problem_id JOIN platform p ON p.platform_id=s.platform_id
    WHERE s.user_id=? ORDER BY s.submitted_at DESC,s.submission_id DESC LIMIT ? OFFSET ?`,[user.user_id,pageSize,(page-1)*pageSize]);
   await connection.commit();res.set('Cache-Control','no-store').json({items,page,pageSize,total,pages});
  }catch(e){await connection.rollback();throw e;}finally{connection.release();}
 });
 return router;
}
