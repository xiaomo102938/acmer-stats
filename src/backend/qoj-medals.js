import {readFile} from 'node:fs/promises';

export async function readQojMedalCounts(rows){
 const passed=new Map(rows.filter(row=>row.platform_name==='QOJ'&&Number(row.passed)===1)
  .map(row=>[row.source_key||row.problem_id,row]));
 const counts={iron:0,bronze:0,silver:0,gold:0};
 const result={counts,total:passed.size,matched:0};
 const path=process.env.QOJ_MEDAL_CATALOG;
 if(!path||!passed.size)return result;

 let catalog;
 try{catalog=JSON.parse(await readFile(path,'utf8'));}
 catch{return result;}
 const candidates=new Map();
 for(const contest of catalog?.contests??[]){
  if(!contest.boardSource||contest.ratingsStale)continue;
  for(const problem of contest.problems??[]){
   const key=String(problem.problemId??'');
   if(!passed.has(key))continue;
   const {acceptedTeams:ac,totalTeams:total}=problem;
   if(!Number.isInteger(ac)||!Number.isInteger(total)||total<=0||ac<0||ac>total)continue;
   const tier=ac*100<=total*10?'gold':ac*100<=total*30?'silver':ac*100<=total*60?'bronze':'iron';
   if(!candidates.has(key))candidates.set(key,[]);
   candidates.get(key).push({tier,contestId:String(contest.id)});
  }
 }
 for(const [key,choices] of candidates){
  const contestId=passed.get(key).problem_url?.match(/\/contest\/(\d+)\/problem\//)?.[1];
  const sameContest=choices.filter(choice=>choice.contestId===contestId);
  const tiers=new Set((sameContest.length?sameContest:choices).map(choice=>choice.tier));
  if(tiers.size!==1)continue;
  counts[tiers.values().next().value]++;
  result.matched++;
 }
 return result;
}
