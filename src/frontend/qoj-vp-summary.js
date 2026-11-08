import {vpMedals,vpMedal} from './qoj-vp-medals.js';
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import {apiFetch} from './api-fetch.js';
import {qojMedalColors,qojMedalLabels} from '../shared/qoj-medal-labels.js';

import * as echarts from 'echarts/core';
import {BarChart} from 'echarts/charts';
import {GridComponent,TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';

echarts.use([BarChart,GridComponent,TooltipComponent,CanvasRenderer]);

function ringBackground(rows){
 const total=rows.reduce((sum,row)=>sum+row.count,0);
 if(!total)return null;
 let cumulative=0;
 const stops=rows.filter(row=>row.count>0).map(row=>{
  const start=cumulative/total*100;
  cumulative+=row.count;
  return row.color+' '+start+'% '+(cumulative/total*100)+'%';
 });
 return 'conic-gradient('+stops.join(',')+')';
}

export default {
 props:{refreshKey:Number},
 emits:['inspect','medals'],
 setup(props,{emit}){
  const sessions=ref([]),scope=ref('all'),error=ref(''),loading=ref(false);
  let request=0;
  async function load(){
   const id=++request;
   loading.value=true;error.value='';
   try{
    const response=await apiFetch('/api/qoj-vp/summary');
    if(!response.ok)throw Error('暂时无法读取场次总览。');
    const result=await response.json();
    if(id===request){
     sessions.value=result.sessions;
     emit('medals',Object.fromEntries(result.sessions.map(s=>[key(s),s.medal])));
    }
   }catch(e){if(id===request)error.value=e.message;}
   finally{if(id===request)loading.value=false;}
  }
  watch(()=>props.refreshKey,load,{immediate:true});
  const visible=computed(()=>scope.value==='recent'?sessions.value.slice(0,10):sessions.value);
  const trend=computed(()=>[...visible.value].reverse());
  const average=field=>visible.value.length?(visible.value.reduce((sum,row)=>sum+row[field],0)/visible.value.length).toFixed(1):'—';
  const chartEl=ref(null);
  const topPercent=s=>s.medal?.place&&s.medal.total?Math.min(100,100*s.medal.place/s.medal.total):null;
  const unranked=computed(()=>visible.value.filter(s=>topPercent(s)==null).length);
  const coverage=computed(()=>visible.value.filter(row=>row.completeRoster).length);
  const tiers=computed(()=>Object.entries(qojMedalLabels).map(([tier,label])=>{
   const counts={total:0,solved:0,upsolved:0};
   for(const session of visible.value){
    const row=session.byTier[tier];
    if(row)for(const field of Object.keys(counts))counts[field]+=row[field];
   }
   return {tier,label,...counts};
  }));
  const distribution=computed(()=>Object.entries(vpMedals).map(([tier,meta])=>({
   tier,...meta,count:visible.value.filter(s=>(s.medal?.tier??'unknown')===tier).length
  })));
  const medalRows=computed(()=>distribution.value.slice(0,4));
  const difficultyRows=computed(()=>tiers.value.map(row=>({
   tier:row.tier,label:row.label,count:row.total,color:qojMedalColors[row.tier]??'var(--muted)'
  })));
  const distributions=computed(()=>[
   {title:'场次奖牌分布',rows:medalRows.value,unit:'场',
    note:distribution.value.slice(4).map(row=>row.label+' '+row.count+' 场').join(' · ')},
   {title:'题目难度分布',rows:difficultyRows.value,unit:'道',
    note:'有完整题单的场次 '+coverage.value+' / '+visible.value.length}
  ].map(group=>({...group,ring:ringBackground(group.rows)})));
  const caption=s=>[s.contest_name,s.starts_at,'过题 '+s.solved,'罚时 '+s.penalty,
   '模拟奖牌 '+vpMedal(s.medal).label,s.medal?.place?'原赛参考第 '+s.medal.place+' / '+s.medal.total+' 名（前 '+topPercent(s).toFixed(1)+'%）':null].filter(Boolean).join(' · ');
  const key=s=>[s.account_id,s.contest_key,s.starts_at].join('|');
  let chart,resize,themeObserver;
  function draw(){
   if(!chart)return;
   const css=getComputedStyle(document.documentElement);
   const token=name=>css.getPropertyValue(name).trim();
   const data=trend.value.map(session=>{
    const percent=topPercent(session);
    return {
     value:percent==null?null:100-percent,
     itemStyle:{color:vpMedal(session.medal).color}
    };
   });
   chart.setOption({
    animation:false,
    grid:{left:76,right:22,top:18,bottom:32},
    xAxis:{type:'category',data:trend.value.map(key),axisTick:{show:false},
     axisLabel:{color:token('--muted'),hideOverlap:true,formatter:(_,index)=>trend.value[index].starts_at.slice(5,10)},
     axisLine:{lineStyle:{color:token('--border')}}},
    yAxis:{type:'value',min:0,max:100,interval:25,axisLabel:{color:token('--muted'),formatter:value=>'前 '+(100-value)+'%'},
     splitLine:{lineStyle:{color:token('--rowBorder')}}},
    tooltip:{trigger:'item',renderMode:'richText',confine:true,backgroundColor:token('--panel'),
     borderColor:token('--border'),textStyle:{color:token('--text')},
     formatter:({dataIndex})=>caption(trend.value[dataIndex]).split(' · ').join('\n')},
    series:[{type:'bar',data,barWidth:'70%',barMaxWidth:32}]
   },true);
  }
  function disposeChart(){
   resize?.disconnect();
   themeObserver?.disconnect();
   chart?.dispose();
   chart=null;
  }
  watch(chartEl,el=>{
   disposeChart();
   if(!el)return;
   chart=echarts.init(el);
   chart.on('click','series',({dataIndex})=>emit('inspect',key(trend.value[dataIndex])));
   resize=new ResizeObserver(()=>chart?.resize());
   resize.observe(el);
   themeObserver=new MutationObserver(draw);
   themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
   draw();
  },{flush:'post'});
  watch(trend,draw,{flush:'post'});
  onBeforeUnmount(disposeChart);
  return {sessions,scope,error,loading,visible,average,coverage,tiers,load,distributions,chartEl,unranked};
 },
 template:`
 <article class="panel vp-summary" aria-label="场次总览">
  <div class="panel-head"><h2>场次总览</h2>
   <label>范围 <select v-model="scope" aria-label="场次总览范围"><option value="all">全部场次</option><option value="recent">最近 10 场</option></select></label>
  </div>
  <LoadingNotice v-if="loading">正在读取场次总览…</LoadingNotice>
  <p v-if="error" role="alert" class="error">{{error}} <button @click="load">重试</button></p>
  <p v-else-if="!loading&&!sessions.length" class="footnote">同步 QOJ VP 记录后可查看场次总览。</p>
  <template v-if="visible.length">
   <p>场次 <strong>{{visible.length}}</strong> · 场均赛内通过 <strong>{{average('solved')}}</strong> 道 · 场均赛后补题 <strong>{{average('upsolved')}}</strong> 道</p>
   <h3>场次趋势</h3>
   <p class="footnote">场次按日期等距排列。柱越高，原赛参考排名越靠前。颜色表示模拟奖牌，点击打开复盘。</p>
   <p v-if="unranked" class="footnote">{{unranked}} 场暂无可比原赛名次。</p>
   <div ref="chartEl" class="chart" role="img" aria-label="按日期排列的 QOJ 原赛参考排名柱状图"></div>
   <div class="vp-distributions">
    <section v-for="group in distributions" :key="group.title">
     <h3>{{group.title}}</h3>
     <div class="vp-medal-distribution">
      <div v-if="group.ring" class="vp-medal-ring" :style="{background:group.ring}" aria-hidden="true"></div>
      <ul class="vp-medal-legend">
       <li v-for="row in group.rows" :key="row.tier"><span :style="{background:row.color}"></span>{{row.label}} {{row.count}} {{group.unit}}</li>
      </ul>
     </div>
     <p class="footnote">{{group.note}}</p>
    </section>
   </div>
   <h3>按题目档位统计</h3>
   <p class="footnote">有完整题单的场次 {{coverage}} / {{visible.length}}。同一道题在不同场次分别计数。</p>
   <div v-if="coverage" class="table-wrap"><table><thead><tr><th>档位</th><th>出题数</th><th>赛内通过</th><th>赛后补题</th></tr></thead>
    <tbody><tr v-for="row in tiers" :key="row.tier"><td>{{row.label}}</td><td>{{row.total}}</td><td>{{row.solved}}</td><td>{{row.upsolved}}</td></tr></tbody>
   </table></div>
   <ModuleHelp><p class="footnote">模拟奖牌依据 VP 过题数和罚时，与 RankLand 原赛正式队伍的奖牌线比较。过题数超过牌线，或题数相同且总罚时更低，才达到该档。成绩打平时继续比较下一档。场次奖牌分布只统计可判定奖牌的场次。题目难度分布统计当前范围内完整题单的出题数，包含未分档题。同一道题出现在不同场次时分别计数。缺少整场题单或可核验奖牌线时标为待核实。</p></ModuleHelp>
  </template>
 </article>`
};
