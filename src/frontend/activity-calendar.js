const dayMs=86400000;
const iso=date=>date.toISOString().slice(0,10);
export function activityLevel(value){
 return value<=0?0:value<=2?1:value<=5?2:value<=9?3:4;
}
export function buildCalendar(year,rows,today,metric='accepted_problem_count'){
 const first=new Date(Date.UTC(year,0,1)),last=new Date(Date.UTC(year,11,31));
 const start=new Date(first);start.setUTCDate(start.getUTCDate()-start.getUTCDay());
 const end=new Date(last);end.setUTCDate(end.getUTCDate()+6-end.getUTCDay());
 const byDay=new Map();
 for(const row of rows){
  const old=byDay.get(row.day)||{submission_count:0,accepted_count:0,accepted_problem_count:0,problem_count:0};
  for(const name of Object.keys(old))old[name]+=Number(row[name]||0);
  byDay.set(row.day,old);
 }
 const cells=[];
 for(let stamp=start.getTime();stamp<=end.getTime();stamp+=dayMs){
  const date=new Date(stamp),day=iso(date),inside=date.getUTCFullYear()===year,future=day>today;
  const counts=byDay.get(day)||{submission_count:0,accepted_count:0,accepted_problem_count:0,problem_count:0};
  const value=Number(counts[metric]||0);
  cells.push({day,inside,future,...counts,value,level:inside&&!future?activityLevel(value):0,
   label:day+'：'+counts.submission_count+' 次提交，'+counts.accepted_count+' 次 AC，'+counts.accepted_problem_count+' 道 AC 题目'});
 }
 const months=Array.from({length:12},(_,month)=>{
  const date=new Date(Date.UTC(year,month,1));
  return {name:(month+1)+'月',column:Math.floor((date-start)/dayMs/7)+1};
 });
 return {cells,months,columns:cells.length/7};
}
