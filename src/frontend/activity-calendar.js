const dayMs=86400000;
const iso=date=>date.toISOString().slice(0,10);
export function activityLevel(value){
 return value<=0?0:value<=2?1:value<=5?2:value<=9?3:4;
}
export function buildCalendar(year,rows,today,metric='accepted_problem_count'){
 return buildRange(new Date(Date.UTC(year,0,1)),new Date(Date.UTC(year,11,31)),rows,today,metric,false);
}
export function buildRollingCalendar(rows,today,metric='accepted_problem_count'){
 const last=new Date(today+'T00:00:00Z'),first=new Date(last);first.setUTCDate(first.getUTCDate()-364);
 return buildRange(first,last,rows,today,metric,true);
}
function buildRange(first,last,rows,today,metric,rolling){
 const start=new Date(first);start.setUTCDate(start.getUTCDate()-start.getUTCDay());
 const end=new Date(last);if(!rolling)end.setUTCDate(end.getUTCDate()+6-end.getUTCDay());
 const byDay=new Map();
 for(const row of rows){
  const old=byDay.get(row.day)||{submission_count:0,accepted_count:0,accepted_problem_count:0,problem_count:0,activity_count:0,has_submission_data:false,has_activity_data:false};
  for(const name of ['submission_count','accepted_count','accepted_problem_count','problem_count','activity_count'])old[name]+=Number(row[name]||0);
  old.has_submission_data ||= row.has_submission_data??Number(row.submission_count)>0;
  old.has_activity_data ||= row.has_activity_data??Number(row.activity_count)>0;
  byDay.set(row.day,old);
 }
 const cells=[];
 for(let stamp=start.getTime();stamp<=end.getTime();stamp+=dayMs){
  const date=new Date(stamp),day=iso(date),inside=stamp>=first.getTime()&&stamp<=last.getTime(),future=day>today;
  const counts=byDay.get(day)||{submission_count:0,accepted_count:0,accepted_problem_count:0,problem_count:0,activity_count:0,has_submission_data:false,has_activity_data:false};
  const value=Number(counts[metric]||0);
  cells.push({day,inside,future,...counts,value,level:inside&&!future?activityLevel(value):0,
   label:day+'：'+(counts.has_submission_data?counts.submission_count+' 次提交，'+counts.accepted_count+' 次 AC，'+counts.accepted_problem_count+' 道 AC 题目':counts.has_activity_data?'站点活动 '+counts.activity_count+' 次（无逐次提交明细）':'暂无已同步明细')+(counts.has_submission_data&&counts.has_activity_data?'；另有站点活动 '+counts.activity_count+' 次':'')});
 }
 const months=[];
 for(let date=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),1));date<=last;date.setUTCMonth(date.getUTCMonth()+1)){
  const stamp=date<first?first:date,key=iso(date).slice(0,7);
  months.push({key,name:(date.getUTCMonth()+1)+'月',column:Math.floor((stamp-start)/dayMs/7)+1});
 }
 return {cells,months,columns:Math.ceil(cells.length/7),rangeStart:iso(first),rangeEnd:iso(last)};
}
