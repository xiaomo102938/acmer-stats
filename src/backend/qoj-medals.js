import {readFile,stat} from 'node:fs/promises';

export function catalogMedalRows(catalog){
 const rows=new Map();
 for(const contest of catalog.contests){
  const contestId=String(contest?.id??'');
  if(!/^\d{1,32}$/.test(contestId)||typeof contest.boardSource!=='string'
    ||!contest.boardSource||contest.boardSource.length>64||contest.ratingsStale)continue;
  for(const problem of contest.problems??[]){
   const key=String(problem?.problemId??'');
   const {acceptedTeams:ac,totalTeams:total}=problem??{};
   if(!/^\d{1,32}$/.test(key)||!Number.isInteger(ac)||!Number.isInteger(total)
     ||total<=0||total>0xffffffff||ac<0||ac>total)continue;
   const tier=ac*100<=total*10?'gold':ac*100<=total*30?'silver':ac*100<=total*60?'bronze':'iron';
   rows.set(contestId+':'+key,[contestId,key,ac,total,tier,contest.boardSource]);
  }
 }
 return [...rows.values()];
}

export async function initQojMedalStore(pool,catalogPath){
 const schema=await readFile(new URL('../../sql/migrations/017_qoj_contest_medal.sql',import.meta.url),'utf8');
 await pool.query(schema);
 let signature;
 let importing=false;
 async function refresh(){
  if(importing)return;
  importing=true;
  try{
   const file=await stat(catalogPath);
   const next=[file.size,file.mtimeMs,file.ctimeMs,file.ino].join(':');
   if(signature===next)return;
   const rows=catalogMedalRows(JSON.parse(await readFile(catalogPath,'utf8')));
   if(rows.length){
    const connection=await pool.getConnection();
    try{
     await connection.beginTransaction();
     // Missing or stale standings do not erase previously imported evidence.
     for(let i=0;i<rows.length;i+=500){
      await connection.query(
       'INSERT INTO qoj_contest_medal (contest_key,problem_key,accepted_teams,total_teams,tier,board_source) VALUES ? '+
       'AS incoming ON DUPLICATE KEY UPDATE accepted_teams=incoming.accepted_teams,total_teams=incoming.total_teams,'+
       'tier=incoming.tier,board_source=incoming.board_source',[rows.slice(i,i+500)]);
     }
     await connection.commit();
    }catch(error){
     await connection.rollback();
     throw error;
    }finally{connection.release();}
   }
   signature=next;
  }catch(error){
   if(error.code!=='ENOENT')console.error('QOJ medal import failed:',error.code||error.name);
  }finally{importing=false;}
 }
 if(!catalogPath)return ()=>{};
 void refresh();
 const timer=setInterval(refresh,30_000);
 timer.unref();
 return ()=>clearInterval(timer);
}

export async function readQojMedalCounts(connection,rows){
 const passed=new Map(rows.filter(row=>row.platform_name==='QOJ'&&Number(row.passed)===1)
  .map(row=>[String(row.source_key||row.problem_id),row]));
 const counts={iron:0,bronze:0,silver:0,gold:0};
 const result={counts,total:passed.size,matched:0};
 if(!passed.size)return result;
 const keys=[...passed.keys()];
 const candidates=new Map();
 for(let i=0;i<keys.length;i+=500){
  const [matches]=await connection.query(
   'SELECT contest_key,problem_key,tier FROM qoj_contest_medal WHERE problem_key IN (?)',[keys.slice(i,i+500)]);
  for(const match of matches){
   if(!candidates.has(match.problem_key))candidates.set(match.problem_key,[]);
   candidates.get(match.problem_key).push(match);
  }
 }
 for(const [key,choices] of candidates){
  const contestId=passed.get(key).problem_url?.match(/\/contest\/(\d+)\/problem\//)?.[1];
  const exact=choices.find(choice=>choice.contest_key===contestId);
  const tiers=new Set(exact?[exact.tier]:choices.map(choice=>choice.tier));
  if(tiers.size!==1)continue;
  counts[tiers.values().next().value]++;
  result.matched++;
 }
 return result;
}
