import {randomUUID} from 'node:crypto';
import {tagDefinition} from './tags.js';
import {applyDifficultyMetadata} from './difficulty-metadata.js';
const short=(value,max)=>Array.from(String(value)).slice(0,max).join('');
export function sqlDate(seconds) {
 return new Date(seconds*1000+8*3600000).toISOString().slice(0,19).replace('T',' ');
}
export async function saveSubmissions(connection,account,result) {
 const summary={newSubmissions:0,updatedSubmissions:0,newProblems:0};
 const affected=new Set();
 await connection.beginTransaction();
 try {
  const [[current]]=await connection.execute('SELECT login_name FROM platform_account WHERE account_id=? FOR UPDATE',[account.account_id]);
  if(!current||current.login_name!==account.login_name) throw new Error('Account changed while synchronizing');
  for(const s of result.items){
   const title=short(s.title,100);
   let [[problem]]=await connection.execute('SELECT problem_id FROM problem WHERE platform_id=? AND (source_key=? OR (source_key IS NULL AND problem_name=?)) ORDER BY source_key DESC LIMIT 1',
    [account.platform_id,s.key,title]);
   if(!problem){
    problem={problem_id:randomUUID()};
    await connection.execute('INSERT INTO problem(problem_id,problem_name,difficulty,platform_id,source_key,problem_url,native_difficulty,difficulty_source) VALUES(?,?,NULL,?,?,?,?,?)',
     [problem.problem_id,title,account.platform_id,s.key,s.url,s.native,s.nativeSource||(account.platform_name==='Codeforces'&&s.native!=null?'codeforces':null)]);
   }else await connection.execute('UPDATE problem SET source_key=?,problem_url=?,native_difficulty=COALESCE(?,native_difficulty),difficulty_source=COALESCE(?,difficulty_source) WHERE problem_id=?',[s.key,s.url,s.native,s.nativeSource||(account.platform_name==='Codeforces'&&s.native!=null?'codeforces':null),problem.problem_id]);
   for(const value of new Set(s.tags)){
    const definition=tagDefinition(value),name=short(definition.key,120);
    if(!name) continue;
    await connection.execute('INSERT INTO tag(tag_id,tag_name,display_name) VALUES(?,?,?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name)',[randomUUID(),name,short(definition.display,180)]);
    const [[tag]]=await connection.execute('SELECT tag_id FROM tag WHERE tag_name=?',[name]);
    await connection.execute('INSERT IGNORE INTO problem_tag(problem_id,tag_id) VALUES(?,?)',[problem.problem_id,tag.tag_id]);
   }
   const [[old]]=await connection.execute('SELECT passed FROM synced_submission WHERE user_id=? AND platform_id=? AND source_id=?',[account.user_id,account.platform_id,s.id]);
   const time=sqlDate(s.time);
   if(!old){
    await connection.execute('INSERT INTO synced_submission(submission_id,user_id,platform_id,source_id,account_login,problem_id,passed,submitted_at) VALUES(?,?,?,?,?,?,?,?)',
     [randomUUID(),account.user_id,account.platform_id,s.id,account.login_name,problem.problem_id,s.passed,time]);
    summary.newSubmissions++;
   }else if(old.passed!==s.passed){
    await connection.execute('UPDATE synced_submission SET passed=?,submitted_at=? WHERE user_id=? AND platform_id=? AND source_id=?',[s.passed,time,account.user_id,account.platform_id,s.id]);
    summary.updatedSubmissions++;
   }
   affected.add(problem.problem_id);
  }
  for(const problemId of affected){
   const [[counts]]=await connection.execute('SELECT COUNT(*) AS n,MAX(passed) AS accepted,DATE(MAX(submitted_at)) AS day FROM synced_submission WHERE user_id=? AND problem_id=?',[account.user_id,problemId]);
   const [[record]]=await connection.execute('SELECT * FROM record WHERE user_id=? AND problem_id=? FOR UPDATE',[account.user_id,problemId]);
   const n=Math.min(999,Number(counts.n)+(record?.manual_submit_count||0));
   const passed=Math.max(counts.accepted||0,record?.manual_passed||0);
   const day=record?.manual_solve_date&&record.manual_solve_date>counts.day?record.manual_solve_date:counts.day;
   if(record) await connection.execute('UPDATE record SET submit_count=?,passed=?,solve_date=? WHERE record_id=?',[n,passed,day,record.record_id]);
   else{
    await connection.execute('INSERT INTO record(record_id,passed,submit_count,solve_date,user_id,problem_id) VALUES(?,?,?,?,?,?)',[randomUUID(),passed,n,day,account.user_id,problemId]);
    summary.newProblems++;
   }
  }
  if(result.metadata)await applyDifficultyMetadata(connection,account.platform_id,account.platform_name,result.metadata);
  const message='新增 '+summary.newSubmissions+' 条提交、更新 '+summary.updatedSubmissions+' 条判定、新增 '+summary.newProblems+' 道题。'+result.note;
  await connection.execute("UPDATE platform_account SET sync_status='success',sync_message=?,last_sync=NOW(),sync_cursor=? WHERE account_id=?",[message.slice(0,1000),result.cursor,account.account_id]);
  await connection.commit();
  return {...summary,message};
 } catch(error){await connection.rollback();throw error;}
}
