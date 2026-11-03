export const luoguDifficulties=['未评定','入门','普及-','普及','普及+/提高-','提高','提高+/省选-','省选/NOI-','NOI/NOI+/CTS'];
export function formatDifficulty(row){
 const value=row.native_difficulty;
 if(row.platform_name==='洛谷'&&value!=null&&luoguDifficulties[Number(value)])return luoguDifficulties[Number(value)];
 if(value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))){
  if(row.platform_name==='Codeforces')return 'CF '+value;
  if(row.platform_name==='AtCoder')return 'AT '+value+(row.difficulty_source==='atcoder_problems_experimental'?' · 实验估计':' · 估计');
  return String(value);
 }
 if(['Codeforces','AtCoder'].includes(row.platform_name))return '暂无公开难度';
 return row.difficulty||'暂无难度';
}
export function difficultyBuckets(rows,platform){
 const groups=new Map();
 for(const row of rows.filter(r=>r.platform_name===platform)){
  const value=row.native_difficulty;
  let label,order;
  if(['Codeforces','AtCoder'].includes(platform)){
   if(value!=null&&value!==''&&Number.isFinite(Number(value))){
    const lower=Math.floor(Number(value)/400)*400;label=lower+'–'+(lower+399);order=lower;
   }else{label='暂无公开难度';order=Infinity;}
  }else if(platform==='洛谷'&&value!=null&&luoguDifficulties[Number(value)]){label=luoguDifficulties[Number(value)];order=Number(value);}
  else{label=row.difficulty||'暂无难度';order=['入门','普及','提高','省选','暂无难度'].indexOf(label);}
  const old=groups.get(label)||{name:label,value:0,order};old.value+=Number(row.total_count);groups.set(label,old);
 }
 return [...groups.values()].sort((a,b)=>a.order-b.order).map(({order,...row})=>row);
}
