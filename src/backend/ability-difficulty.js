// acmer-cf-v2: transparent training heuristic, not an official rating prediction.
// AtCoder projection references Silver_Fox's user-rating converter, not a problem calibration.
export const ratingVersion='acmer-cf-v1';
export const luoguCF=[null,800,1000,1400,1800,2000,2200,2700,3200];
export function canonicalProblem(row){
 const key=row.source_key;
 if(key&&row.platform_name==='Codeforces')return 'cf:'+key.toUpperCase();
 if(key&&row.platform_name==='AtCoder')return 'at:'+key.toLowerCase();
 if(key&&row.platform_name==='洛谷'){
  if(/^CF\d+[A-Z]\d?$/i.test(key))return 'cf:'+key.slice(2).toUpperCase();
  if(/^AT_/i.test(key))return 'at:'+key.slice(3).toLowerCase();
 }
 return row.platform_name+':'+(key||row.problem_id);
}
export function estimateCF(row){
 const value=row.native_difficulty,valid=value!=null&&value!==''&&/^\d+(\.\d+)?$/.test(String(value));
 const n=valid?Number(value):null;
 if(row.platform_name==='Codeforces'&&row.difficulty_source==='codeforces'&&n>=800&&n<=4000)return {rating:n,method:'CF 官方题目 rating',confidence:'官方',estimated:false};
 if(row.platform_name==='AtCoder'&&/^atcoder_problems(?:_experimental)?$/.test(row.difficulty_source||'')&&valid&&n<=5000){
  return {rating:Math.round(Math.min(3900,Math.max(800,3900*(n+940)/5155))/100)*100,method:'AT 社区难度 → CF 实验换算 v1',confidence:'低',estimated:true};
 }
 if(row.platform_name==='洛谷'&&row.difficulty_source==='luogu'&&valid&&Number.isInteger(n)&&luoguCF[n]!=null)return {rating:luoguCF[n],method:'洛谷八档难度映射 v1',confidence:'低',estimated:true};
 if(row.platform_name==='牛客'&&row.difficulty_source==='nowcoder'&&Number.isInteger(n)&&n>0&&n<=4500){
  return {rating:Math.max(800,Math.min(4000,n)),method:'牛客题库原分 → CF 近似映射',confidence:'低',estimated:true};
 }
 // No numerical rating is invented from a platform name, solve count, or missing metadata.
 return {rating:null,method:'暂无可靠换算依据',confidence:'无',estimated:true};
}
export function ratedProblems(rows){
 const official=new Map();
 for(const r of rows){const e=estimateCF(r);if(!e.estimated&&e.rating!=null)official.set(canonicalProblem(r),e);}
 return rows.map(row=>{
  const key=canonicalProblem(row),exact=official.get(key),e=exact||estimateCF(row);
  return {...row,...e,canonical_key:key,method:exact&&row.platform_name!=='Codeforces'?'同源 CF 题目官方 rating':e.method,rating_version:ratingVersion};
 });
}
