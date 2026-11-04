// Public profile totals are independent of the limited recent-AC submission feed.
export function parseLeetcodeProgress(body){
 const p=body.errors?.length?null:body.data?.userProfileUserQuestionProgress;
 function total(rows){
  if(!Array.isArray(rows)||rows.length!==3||new Set(rows.map(r=>r.difficulty)).size!==3||rows.some(r=>!['EASY','MEDIUM','HARD'].includes(r.difficulty)||!Number.isInteger(r.count)||r.count<0))throw new Error('Invalid LeetCode progress');
  return rows.reduce((n,r)=>n+r.count,0);
 }
 if(!p)throw new Error('LeetCode public progress unavailable');
 const passed=total(p.numAcceptedQuestions),failed=total(p.numFailedQuestions);
 return {passed,attempted:passed+failed};
}
export async function collectLeetcodeProgress(login){
 const r=await fetch('https://leetcode.cn/graphql/',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(18000),headers:{'Content-Type':'application/json',Referer:'https://leetcode.cn/'},body:JSON.stringify({query:'query($userSlug:String!){userProfileUserQuestionProgress(userSlug:$userSlug){numAcceptedQuestions{difficulty count} numFailedQuestions{difficulty count}}}',variables:{userSlug:login}})});
 if(!r.ok)throw new Error('LeetCode progress source unavailable');
 return parseLeetcodeProgress(await r.json());
}
export function applyLeetcodeTotals(overview,platforms,snapshots){
 // Multiple accounts need problem identities to deduplicate; never sum overlapping totals.
 const rows=snapshots.filter(s=>s.platform_name==='LeetCode');
 if(rows.length!==1)return;
 const s=rows[0],p=platforms.find(p=>p.platform_name==='LeetCode');
 if(!p)return;
 const total=Number(s.profile_attempted_count),passed=Number(s.profile_passed_count);
 if(!Number.isInteger(total)||!Number.isInteger(passed)||passed<0||total<passed)return;
 const o=overview.find(o=>o.user_id===s.user_id);
 if(o){o.total_problems=Number(o.total_problems)+total-Number(p.total_count);o.passed_problems=Number(o.passed_problems)+passed-Number(p.passed_count);}
 if(o)o.pass_rate=o.total_problems?Math.round(o.passed_problems/o.total_problems*1000)/10:0;
 p.total_count=total;p.passed_count=passed;p.pass_rate=total?Math.round(passed/total*1000)/10:0;p.count_source='力扣个人主页汇总（含未导入历史）';
}
