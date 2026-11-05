import {randomUUID} from 'node:crypto';
export async function saveLuoguSnapshot(connection,account,snapshot){
 await connection.beginTransaction();
 try{
  const [[current]]=await connection.execute('SELECT login_name FROM platform_account WHERE account_id=? FOR UPDATE',[account.account_id]);
  if(!current||current.login_name!==account.login_name)throw new Error('Account changed during sync');
  for(const item of snapshot.inventory){
   let [[problem]]=await connection.execute("SELECT problem_id FROM problem WHERE platform_id=? AND (source_key=? OR (source_key IS NULL AND problem_name LIKE ?)) ORDER BY source_key DESC LIMIT 1",[account.platform_id,item.key,'洛谷 '+item.key+' %']);
   if(!problem){
    problem={problem_id:randomUUID()};
    await connection.execute("INSERT INTO problem(problem_id,problem_name,platform_id,source_key,problem_url,native_difficulty,difficulty_source,difficulty) VALUES(?,?,?,?,?,?,?,NULL)",
     [problem.problem_id,Array.from(item.title).slice(0,100).join(''),account.platform_id,item.key,item.url,item.native,'luogu']);
   }else await connection.execute('UPDATE problem SET source_key=?,problem_name=?,problem_url=?,native_difficulty=COALESCE(?,native_difficulty),difficulty_source=? WHERE problem_id=?',
    [item.key,Array.from(item.title).slice(0,100).join(''),item.url,item.native,'luogu',problem.problem_id]);
   await connection.execute('INSERT INTO platform_problem_inventory(user_id,platform_id,problem_id,account_uid,passed,observed_at) VALUES(?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE passed=GREATEST(passed,VALUES(passed)),observed_at=NOW()',
    [account.user_id,account.platform_id,problem.problem_id,snapshot.uid,item.passed]);
  }
  for(const day of snapshot.activity)await connection.execute('INSERT INTO platform_daily_activity(user_id,platform_id,account_uid,activity_day,activity_count) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE activity_count=VALUES(activity_count)',[account.user_id,account.platform_id,snapshot.uid,day.day,day.count]);
  await connection.execute('INSERT INTO platform_snapshot(account_id,passed_count,attempted_count,activity_days,profile_passed_count,profile_attempted_count,observed_at) VALUES(?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE passed_count=VALUES(passed_count),attempted_count=VALUES(attempted_count),activity_days=VALUES(activity_days),profile_passed_count=VALUES(profile_passed_count),profile_attempted_count=VALUES(profile_attempted_count),observed_at=NOW()',[account.account_id,snapshot.passedCount,snapshot.attemptedCount,snapshot.activity.length,snapshot.reportedPassed,snapshot.reportedAttempted]);
  const message='已同步洛谷公开清单：'+snapshot.passedCount+' 道通过题、'+snapshot.attemptedCount+' 道尝试题，'+snapshot.activity.length+' 天站点活动。主页显示通过 '+snapshot.reportedPassed+' / 尝试 '+snapshot.reportedAttempted+'。没有逐次提交或逐题日期，不写入虚构提交。'+(snapshot.hasActivity?'':'本次未获取到每日活动，已保留旧活动。');
  await connection.execute("UPDATE platform_account SET last_sync=NOW() WHERE account_id=?",[account.account_id]);
  await connection.commit();return {message};
 }catch(error){await connection.rollback();throw error;}
}
