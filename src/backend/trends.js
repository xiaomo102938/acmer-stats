import express from 'express';
const ms=86400000,iso=d=>d.toISOString().slice(0,10),date=s=>new Date(s+'T00:00:00Z');
export const grains={month:['day','week'],year:['day','week','month','quarter'],life:['day','week','month','quarter','year','threeYear']};
export function trendRange(query,today,earliest){
 const mode=String(query.mode||'year'),grain=String(query.grain||(mode==='month'?'day':'month'));
 if(!grains[mode]?.includes(grain))throw Object.assign(new Error('统计范围或粒度无效。'),{status:400});
 let start,end;
 if(mode==='month'){
  const month=String(query.month||today.slice(0,7));
  if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)||month<'1970-01'||month>today.slice(0,7))throw Object.assign(new Error('请选择有效的月份。'),{status:400});
  start=month+'-01';const d=date(start);d.setUTCMonth(d.getUTCMonth()+1);end=iso(new Date(d-ms));
 }else if(mode==='year'){
  const year=String(query.year||today.slice(0,4));
  if(!/^\d{4}$/.test(year)||Number(year)<1970||year>today.slice(0,4))throw Object.assign(new Error('请选择有效的年份。'),{status:400});
  start=year+'-01-01';end=year+'-12-31';
 }else{start=earliest||today;end=today;}
 end=end>today?today:end;
 return {mode,grain,start,end,endExclusive:iso(new Date(date(end).getTime()+ms))};
}
export function trendBuckets(range,daily){
 const map=new Map(),base=Number(range.start.slice(0,4));
 for(let d=date(range.start);iso(d)<=range.end;d=new Date(d.getTime()+ms)){
  const day=iso(d),y=d.getUTCFullYear(),m=d.getUTCMonth();let key=day,label=day;
  if(range.grain==='week'){const monday=new Date(d);monday.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);key=iso(monday);label=key;}
  if(range.grain==='month'){key=day.slice(0,7);label=key;}
  if(range.grain==='quarter'){key=y+'-Q'+(Math.floor(m/3)+1);label=key;}
  if(range.grain==='year'){key=String(y);label=key;}
  if(range.grain==='threeYear'){const first=base+Math.floor((y-base)/3)*3;key=String(first);label=first+'—'+(first+2);}
  if(!map.has(key))map.set(key,{key,label,start:day,end:day,submission_count:0,accepted_count:0,first_ac_count:0});
  map.get(key).end=day;
 }
 const byDay=new Map(daily.map(r=>[r.day,r]));
 for(const b of map.values())for(let d=date(b.start);iso(d)<=b.end;d=new Date(d.getTime()+ms)){
  const r=byDay.get(iso(d));if(r)for(const name of ['submission_count','accepted_count','first_ac_count'])b[name]+=Number(r[name]||0);
 }
 return [...map.values()];
}
export function trendRouter(pool){
 const router=express.Router();
 router.get('/',async(req,res)=>{
  const connection=await pool.getConnection();
  try{
   await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await connection.query('START TRANSACTION READ ONLY');
   const [[clock]]=await connection.query('SELECT CURRENT_DATE() AS today');
   const [[user]]=await connection.query('SELECT user_id FROM user ORDER BY user_id LIMIT 1');
   const [platforms]=await connection.query('SELECT platform_name FROM platform ORDER BY platform_name');
   const platform=String(req.query.platform||'all');if(platform!=='all'&&!platforms.some(p=>p.platform_name===platform))throw Object.assign(new Error('平台无效。'),{status:400});
   const filter=platform==='all'?'':' AND platform_id=(SELECT platform_id FROM platform WHERE platform_name=?)';
   const args=[user?.user_id||'',...(platform==='all'?[]:[platform])];
   const [[first]]=await connection.execute('SELECT DATE(MIN(submitted_at)) AS first_day FROM synced_submission WHERE user_id=?'+filter+' AND submitted_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)',args);
   const range=trendRange(req.query,clock.today,first.first_day);
   const [daily]=await connection.execute(`SELECT DATE(submitted_at) AS day,COUNT(*) AS submission_count,SUM(passed=1) AS accepted_count FROM synced_submission WHERE user_id=?${filter} AND submitted_at>=? AND submitted_at<? GROUP BY DATE(submitted_at)`,[...args,range.start,range.endExclusive]);
   // Find each problem's first AC across all stored history, before filtering the display window.
   const [firstAC]=await connection.execute(`SELECT DATE(first_ac) AS day,COUNT(*) AS first_ac_count FROM (SELECT MIN(submitted_at) AS first_ac FROM synced_submission WHERE user_id=?${filter} AND passed=1 GROUP BY problem_id) f WHERE first_ac>=? AND first_ac<? GROUP BY DATE(first_ac)`,[...args,range.start,range.endExclusive]);
   const merged=new Map(daily.map(r=>[r.day,r]));for(const r of firstAC)merged.set(r.day,{...(merged.get(r.day)||{day:r.day}),first_ac_count:r.first_ac_count});
   const buckets=trendBuckets(range,[...merged.values()]);
   const years=[...new Set([...(range.mode==='year'?[Number(range.start.slice(0,4))]:[]),...Array.from({length:Number(clock.today.slice(0,4))-Number((first.first_day||clock.today).slice(0,4))+1},(_,i)=>Number(clock.today.slice(0,4))-i)])].sort((a,b)=>b-a);
   await connection.commit();res.set('Cache-Control','no-store').json({...range,serverDate:clock.today,earliest:first.first_day,years,platforms:platforms.map(p=>p.platform_name),buckets});
  }catch(e){await connection.rollback();throw e;}finally{connection.release();}
 });return router;
}
