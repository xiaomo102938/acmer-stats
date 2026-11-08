export async function readAcceptedDays(connection){
 const [rows]=await connection.query(`SELECT problem_id,DATEDIFF(DATE(submitted_at),'1970-01-01') AS day
  FROM synced_submission WHERE passed=1 AND user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)
  GROUP BY problem_id,day ORDER BY day DESC`);
 const days=new Map();
 for(const row of rows){
  if(!days.has(row.problem_id))days.set(row.problem_id,[]);
  days.get(row.problem_id).push(row.day);
 }
 return days;
}

export async function readProblemRows(connection){
 const [rows]=await connection.query(`SELECT pr.*,r.passed,r.solve_date,p.platform_name FROM v_problem_progress r
 JOIN problem pr ON pr.problem_id=r.problem_id JOIN platform p ON p.platform_id=pr.platform_id
 WHERE r.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)`);
 return rows;
}
export async function readAbilityRows(connection){
 const [rows]=await connection.query(`SELECT r.user_id,r.passed,r.solve_date,pr.problem_id,pr.problem_name,pr.problem_url,pr.source_key,pr.native_difficulty,pr.difficulty_source,
  p.platform_name,pt.tag_id,t.tag_name,COALESCE(t.display_name,t.tag_name) AS display_name
  FROM v_problem_progress r STRAIGHT_JOIN problem pr ON pr.problem_id=r.problem_id STRAIGHT_JOIN platform p ON p.platform_id=pr.platform_id
  STRAIGHT_JOIN problem_tag pt ON pt.problem_id=pr.problem_id STRAIGHT_JOIN tag t ON t.tag_id=pt.tag_id
  WHERE r.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)`);
 return rows;
}
