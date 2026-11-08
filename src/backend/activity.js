import { Router } from 'express';

export function activityRouter(pool) {
  const router = Router();
  router.get('/',async(req,res)=>{
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
  return router;
}
