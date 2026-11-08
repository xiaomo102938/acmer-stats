import { Router } from 'express';
import { applyLeetcodeTotals } from './leetcode.js';
import { abilityProfilesByPlatform, skillSubtreeCounts, shanghaiDay } from './ability.js';
import { ratedProblems, ratingVersion } from './ability-difficulty.js';
import { readAbilityRows, readProblemRows, readAcceptedDays } from './ability-store.js';
import { readQojMedalCounts } from './qoj-medals.js';
import { readSkillSettings, mergeSkillRows, specialtyAbility } from './skill-settings.js';

export function dashboardRouter(pool) {
  const router = Router();
  router.get('/', async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.query('START TRANSACTION READ ONLY');
      const read = async sql => (await connection.query(sql))[0];
      const view=req.query.view;
      const overview = view==='analysis'?[]:await read(`SELECT u.user_id,u.user_name,COUNT(r.problem_id) AS total_problems,
   COUNT(IF(r.passed=1,1,NULL)) AS passed_problems,
   ROUND(COUNT(IF(r.passed=1,1,NULL))/NULLIF(COUNT(r.problem_id),0)*100,1) AS pass_rate,
   COUNT(DISTINCT pr.platform_id) AS platform_count,
   (SELECT COUNT(DISTINCT pt.tag_id) FROM v_problem_progress AS progress
    STRAIGHT_JOIN problem_tag pt ON pt.problem_id=progress.problem_id
    WHERE progress.user_id=u.user_id) AS tag_count,
   MIN(r.solve_date) AS first_solve_date,MAX(r.solve_date) AS last_solve_date
   FROM user u LEFT JOIN v_problem_progress r ON r.user_id=u.user_id
   LEFT JOIN problem pr ON pr.problem_id=r.problem_id GROUP BY u.user_id,u.user_name`);
      const platforms = await read('SELECT * FROM v_platform_stats ORDER BY total_count DESC');
      const platformSnapshots=await read(`SELECT a.user_id,p.platform_name,a.login_name,s.passed_count,s.attempted_count,s.activity_days,s.profile_passed_count,s.profile_attempted_count,s.observed_at
   FROM platform_snapshot s JOIN platform_account a ON a.account_id=s.account_id JOIN platform p ON p.platform_id=a.platform_id
   WHERE a.user_id=(SELECT user_id FROM user ORDER BY user_id LIMIT 1)`);
      applyLeetcodeTotals(overview,platforms,platformSnapshots);
      const daily = await read(`SELECT DATE(submitted_at) AS day,COUNT(*) AS submission_count,
        SUM(passed=1) AS accepted_count,COUNT(DISTINCT problem_id) AS problem_count
        FROM synced_submission
        WHERE submitted_at>=DATE_SUB(CURDATE(),INTERVAL 6 DAY) AND submitted_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)
        GROUP BY DATE(submitted_at) ORDER BY day`);
      const [weekSummary] = await read(`SELECT COUNT(DISTINCT problem_id) AS problem_count
        FROM synced_submission WHERE submitted_at>=DATE_SUB(CURDATE(),INTERVAL 6 DAY)
        AND submitted_at<DATE_ADD(CURDATE(),INTERVAL 1 DAY)`);
      const [clock] = await read('SELECT CURRENT_DATE() AS server_date');
      const ratingRows=await readProblemRows(connection);
      const nowcoderCounts=new Map();
      for(const row of ratingRows){
        if(row.platform_name!=='牛客')continue;
        const score=row.difficulty_source==='nowcoder'?Number(row.native_difficulty):null;
        nowcoderCounts.set(score,(nowcoderCounts.get(score)??0)+1);
      }
      const nowcoderDifficulty=[...nowcoderCounts].map(([score,total_count])=>({score,total_count}));
      const ratedRows=ratedProblems(ratingRows);
      // The page views only need totals per platform and rating.
      const difficultyCounts = view === 'overview' || view === 'analysis'
        ? groupDifficultyCounts(ratedRows)
        : [];
      if(view==='overview'){
        await connection.commit();
        return res.set('Cache-Control','no-store').json({
          overview:overview[0]||null,platforms,unifiedDifficulty:difficultyCounts,nowcoderDifficulty,
          daily,weekProblems:weekSummary.problem_count,serverDate:clock.server_date
        });
      }
      const skillSettings=await readSkillSettings(connection);
      const abilityRows=mergeSkillRows(await readAbilityRows(connection),skillSettings.config);
      const recency={days:await readAcceptedDays(connection),day:shanghaiDay()};
      const tagAbility=abilityProfilesByPlatform(abilityRows,recency).map(({problems,...row})=>row);
      const {problems:overallProblems,...overall}=specialtyAbility(ratingRows,abilityRows,skillSettings.config,'specialty',recency);
      const skillCounts=skillSubtreeCounts(abilityRows,skillSettings.config.nodes);
      if(view==='analysis'){
        await connection.commit();
        return res.set('Cache-Control','no-store').json({
          platforms,platformSnapshots,unifiedDifficulty:difficultyCounts,nowcoderDifficulty,
          overallAbility:overall,tagAbility,skillCounts,skillConfig:skillSettings.config
        });
      }
      // Requests without a recognized view still receive the full dashboard payload.
      const qojMedals=await readQojMedalCounts(connection,ratingRows);
      const unifiedDifficulty=ratedRows.map(r=>({platform_name:r.platform_name,cf_rating:r.rating,estimated:r.estimated,total_count:1}));
      const tags=await read('SELECT * FROM v_tag_stats ORDER BY total_count DESC, pass_rate DESC');
      const difficulty = await read('SELECT * FROM v_difficulty_stats');
      const nativeDifficulty = await read(`SELECT p.platform_name,pr.difficulty,pr.native_difficulty,COUNT(r.record_id) AS total_count
        FROM v_problem_progress r JOIN problem pr ON pr.problem_id=r.problem_id
        JOIN platform p ON p.platform_id=pr.platform_id
        GROUP BY p.platform_name,pr.difficulty,pr.native_difficulty`);
      const monthly = await read('SELECT * FROM v_monthly_trend ORDER BY solve_month');
      const recent = await read(`SELECT pr.problem_name, p.platform_name, pr.difficulty, pr.native_difficulty, pr.difficulty_source,pr.source_key,pr.problem_id, r.passed, r.submit_count, r.solve_date
        FROM record r JOIN problem pr ON pr.problem_id=r.problem_id
        JOIN platform p ON p.platform_id=pr.platform_id
        ORDER BY r.solve_date DESC,r.record_id LIMIT 8`);
      await connection.commit();
      res.set('Cache-Control', 'no-store').json({ overview: overview[0] || null, platforms, tags, difficulty, monthly, recent:ratedProblems(recent), nativeDifficulty, unifiedDifficulty, nowcoderDifficulty, qojMedals, ratingVersion, overallAbility:overall, tagAbility, skillCounts, skillConfig:skillSettings.config, platformSnapshots, daily, weekProblems:weekSummary.problem_count, serverDate:clock.server_date });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  });
  return router;
}

function groupDifficultyCounts(rows) {
  const counts = new Map();
  for (const { platform_name, rating } of rows) {
    const key = JSON.stringify([platform_name, rating]);
    const group = counts.get(key);
    if (group) group.total_count++;
    else counts.set(key, { platform_name, cf_rating: rating, total_count: 1 });
  }
  return [...counts.values()];
}
