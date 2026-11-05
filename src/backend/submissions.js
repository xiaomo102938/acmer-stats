import express from 'express';
import {ratedProblems} from './ability-difficulty.js';
import {readProblemRows,readAbilityRows} from './ability-store.js';
import {retryProblems} from './practice.js';
import {readSkillSettings} from './skill-settings.js';
import {mergeSkillRows,specialtyKeys,resolveTag} from '../shared/skill-settings.js';
import {verdictGroups} from '../shared/submission-verdicts.js';

const filters=['all','ac','failed','first','retry',...Object.keys(verdictGroups)];
const latest='s.submitted_at DESC,s.submission_id DESC';
const dateValid=value=>!value||(/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value);
const contains=(row,term)=>[row.problem_name,row.source_key,row.note].some(value=>value?.toLowerCase().includes(term));

export function submissionRouter(pool){
 const router=express.Router();
 router.get('/',async(req,res)=>{
  const {page:rawPage='1',pageSize:rawSize='25',status='all',sort='time',q='',platform='',tag='',from='',to='',unique='0'}=req.query;
  if([rawPage,rawSize,status,sort,q,platform,tag,from,to,unique].some(value=>typeof value!=='string')||
   !/^[1-9]\d{0,7}$/.test(rawPage)||!['10','25','50','100'].includes(rawSize)||!filters.includes(status)||
   !['time','hard','easy'].includes(sort)||!['0','1'].includes(unique)||q.length>200||platform.length>100||tag.length>120||
   !dateValid(from)||!dateValid(to)||(from&&to&&from>to))return res.status(400).json({message:'搜索、筛选或分页参数无效。'});
  const pageSize=Number(rawSize),connection=await pool.getConnection();
  const term=q.trim().toLowerCase();
  try{
   await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
   await connection.query('START TRANSACTION READ ONLY');
   const [[user]]=await connection.query('SELECT user_id FROM user ORDER BY user_id LIMIT 1');
   const [platformRows]=await connection.query('SELECT platform_name FROM platform ORDER BY platform_name');
   const platforms=platformRows.map(row=>row.platform_name);
   let items=[],total=0,pages=1,page=1,tags=[],progress;
   const rates=async rows=>{
    if(!rows.some(row=>row.platform_name==='洛谷'&&/^CF\d+[A-Z]\d?$/i.test(row.source_key||'')))return ratedProblems(rows);
    progress??=await readProblemRows(connection);
    return ratedProblems([...progress,...rows]).slice(progress.length);
   };
   if(user){
    const args=[user.user_id];
    const conditions=['s.user_id=?'];
    if(status==='ac'||status==='first')conditions.push('s.passed=1');
    if(status==='failed'||status==='retry'||Object.hasOwn(verdictGroups,status))conditions.push('s.passed=0');
    if(Object.hasOwn(verdictGroups,status)){
     const values=verdictGroups[status];conditions.push('s.verdict IN ('+values.map(()=>'?').join(',')+')');args.push(...values);
    }
    if(status==='first')conditions.push(`NOT EXISTS (SELECT 1 FROM synced_submission a
      WHERE a.user_id=s.user_id AND a.problem_id=s.problem_id AND a.passed=1
       AND (a.submitted_at<s.submitted_at OR (a.submitted_at=s.submitted_at AND a.submission_id<s.submission_id)))`);
    if(status!=='retry'){
     if(platform){conditions.push('p.platform_name=?');args.push(platform);}
     if(from){conditions.push('s.submitted_at>=?');args.push(from);}
     if(to){conditions.push('s.submitted_at<DATE_ADD(?,INTERVAL 1 DAY)');args.push(to);}
     if(term){
      conditions.push('(LOCATE(?,LOWER(pr.problem_name)) OR LOCATE(?,LOWER(pr.source_key)) OR LOCATE(?,LOWER(n.note)))');
      args.push(term,term,term);
     }
    }
    const source=`FROM synced_submission s JOIN problem pr ON pr.problem_id=s.problem_id
     JOIN platform p ON p.platform_id=s.platform_id LEFT JOIN problem_note n ON n.user_id=s.user_id AND n.problem_id=s.problem_id
     WHERE ${conditions.join(' AND ')}`;
    const select=`SELECT s.submission_id,s.source_id,s.account_login,s.submitted_at,s.passed,s.verdict,
     p.platform_name,pr.problem_id,pr.problem_name,pr.problem_url,pr.source_key,pr.native_difficulty,pr.difficulty_source,n.note ${source} ORDER BY ${latest}`;
    const paginate=()=>{pages=Math.max(1,Math.ceil(total/pageSize));page=Math.min(Number(rawPage),pages);};
    if(status==='retry'||sort!=='time'||unique==='1'){
     let [rows]=await connection.query(select,args);
     if(status==='retry'){
      const {config,catalog}=await readSkillSettings(connection);
      tags=catalog.filter(({key})=>!Object.hasOwn(config.aliases,key)).map(({key,name})=>({key,name:config.names[key]||name}));
      if(config.specialties.length)tags.unshift({key:'@specialty',name:'我的专职题型'});
      const filter=tag==='@specialty'?specialtyKeys(config):tag?new Set([resolveTag(tag,config)]):null;
      progress=await readProblemRows(connection);
      rows=retryProblems(rows,progress,filter?mergeSkillRows(await readAbilityRows(connection),config):[],filter);
      rows=rows.filter(row=>(!platform||row.platform_name===platform)&&(!from||row.submitted_at.slice(0,10)>=from)&&
       (!to||row.submitted_at.slice(0,10)<=to)&&(!term||contains(row,term)));
     }else if(unique==='1'){
      const seen=new Set();
      rows=rows.filter(row=>!seen.has(row.problem_id)&&seen.add(row.problem_id));
     }
     if(sort!=='time'){
      rows=await rates(rows);
      const direction=sort==='hard'?-1:1;
      rows.sort((a,b)=>(a.rating===null)-(b.rating===null)||direction*((a.rating??0)-(b.rating??0)));
     }
     total=rows.length;paginate();items=rows.slice((page-1)*pageSize,page*pageSize);
    }else{
     const [[count]]=await connection.query('SELECT COUNT(*) AS n '+source,args);
     total=Number(count.n);paginate();
     [items]=await connection.query(select+' LIMIT ? OFFSET ?',[...args,pageSize,(page-1)*pageSize]);
    }
   }
   if(sort==='time')items=await rates(items);
   await connection.commit();
   res.set('Cache-Control','no-store').json({items,page,pageSize,total,pages,platforms,tags});
  }catch(error){await connection.rollback();throw error;}finally{connection.release();}
 });
 router.put('/notes/:problemId',async(req,res)=>{
  const value=req.body?.note;
  if(typeof value!=='string'||[...value.trim()].length>30||/[\u0000-\u001f\u007f]/.test(value)){
   return res.status(400).json({message:'备注最多 30 个字符，请使用单行文字。'});
  }
  const note=value.trim();
  const [[owner]]=await pool.execute(`SELECT user_id FROM synced_submission
   WHERE user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1) AND problem_id=? LIMIT 1`,[req.params.problemId]);
  if(!owner)return res.status(404).json({message:'找不到这道题的提交记录。'});
  if(note)await pool.execute('INSERT INTO problem_note(user_id,problem_id,note) VALUES(?,?,?) ON DUPLICATE KEY UPDATE note=VALUES(note)',[owner.user_id,req.params.problemId,note]);
  else await pool.execute('DELETE FROM problem_note WHERE user_id=? AND problem_id=?',[owner.user_id,req.params.problemId]);
  res.json({note});
 });
 return router;
}
