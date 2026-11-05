import {apiFetch} from './api-fetch.js';
import {ref,computed,onMounted,onBeforeUnmount,watch} from 'vue';
import * as echarts from 'echarts/core';
import {LineChart} from 'echarts/charts';
import {GridComponent,TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';

echarts.use([LineChart,GridComponent,TooltipComponent,CanvasRenderer]);
const timestamp=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const dateLabel=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit'});

export function abilityTrendPoints(snapshots,scope){
 const points=[];
 let previous;
 for(const snapshot of snapshots){
  const time=Date.parse(snapshot.at);
  const metric=scope==='all'||scope==='specialty'?snapshot[scope]:snapshot.topics.find(topic=>'topic:'+topic.key===scope);
  if(!metric||metric.score===null){
   if(previous)points.push({value:[time,null]});
   previous=null;
   continue;
  }
  if(previous&&(previous.version!==snapshot.version||previous.metric.scope!==metric.scope||previous.metric.limit!==metric.limit)){
   points.push({value:[(previous.value[0]+time)/2,null]});
  }
  const point={value:[time,metric.score],metric,version:snapshot.version};
  points.push(point);previous=point;
 }
 return points;
}

export default{
 props:{refreshKey:Number},
 setup(props){
  const snapshots=ref([]),historyLimit=ref(null),scope=ref(''),mode=ref('current'),chartEl=ref(null),loading=ref(false),error=ref('');
  const latest=computed(()=>snapshots.value.at(-1));
  const topics=computed(()=>[...new Map(snapshots.value.flatMap(row=>row.topics.map(topic=>[topic.key,topic.name])))].sort((a,b)=>a[1].localeCompare(b[1],'zh-CN')));
  const points=computed(()=>abilityTrendPoints(snapshots.value,scope.value));
  const current=computed(()=>scope.value==='all'||scope.value==='specialty'?latest.value?.[scope.value]:latest.value?.topics.find(topic=>'topic:'+topic.key===scope.value));
  const count=computed(()=>points.value.filter(point=>point.metric).length);
  const hasBreak=computed(()=>points.value.slice(0,-1).some(point=>point.value[1]===null));
  let chart,request,resize,themeObserver;
  function draw(){
   if(!count.value||!chartEl.value){
    chart?.dispose();chart=null;return;
   }
   if(!chart)chart=echarts.init(chartEl.value);
   const css=getComputedStyle(document.documentElement),token=name=>css.getPropertyValue(name).trim();
   chart.setOption({animation:false,color:[token('--green')],
    grid:{left:58,right:22,top:20,bottom:35},
    tooltip:{trigger:'item',renderMode:'richText',backgroundColor:token('--panel'),borderColor:token('--border'),
     textStyle:{color:token('--text')},formatter:({data})=>{
      const {metric,value}=data;
      const lines=[timestamp.format(value[0]),'CF 尺度 '+metric.score+' 分','计分样本 '+metric.count+' / '+metric.limit+' 道'];
      if(metric.names?.length)lines.push(metric.names.join('、'));
      return lines.join('\n');
     }},
    xAxis:{type:'time',axisLabel:{color:token('--muted'),hideOverlap:true,formatter:date=>dateLabel.format(date)},
     axisLine:{lineStyle:{color:token('--border')}}},
    yAxis:{type:'value',scale:true,minInterval:1,axisLabel:{color:token('--muted')},splitLine:{lineStyle:{color:token('--rowBorder')}}},
    series:[{type:'line',showSymbol:true,symbolSize:7,connectNulls:false,data:points.value}]},true);
   chart.resize();
  }
  async function load(){
   request?.abort();
   const active=new AbortController();request=active;loading.value=true;error.value='';
   try{
    const response=await apiFetch('/api/ability/trends?mode='+mode.value,{signal:active.signal}),body=await response.json();
    if(!response.ok)throw new Error(body.message);
    if(active.signal.aborted)return;
    snapshots.value=body.snapshots;historyLimit.value=body.historyLimit;
    if(!scope.value)scope.value=latest.value?.specialty.names.length?'specialty':'all';
   }catch(e){if(!active.signal.aborted)error.value=e.message||'能力趋势读取失败。';}
   finally{if(request===active)loading.value=false;}
  }
  const formatTime=value=>timestamp.format(new Date(value));
  const formatDay=value=>new Date(value).toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'});
  watch(points,draw,{flush:'post'});
  watch(()=>props.refreshKey,load);
  watch(mode,()=>{snapshots.value=[];load();});
  onMounted(()=>{
   load();
   resize=new ResizeObserver(()=>chart?.resize());resize.observe(chartEl.value);
   themeObserver=new MutationObserver(draw);
   themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  });
  onBeforeUnmount(()=>{request?.abort();resize?.disconnect();themeObserver?.disconnect();chart?.dispose();});
  return {snapshots,historyLimit,scope,mode,chartEl,loading,error,latest,topics,current,count,hasBreak,load,formatTime,formatDay};
 },
 template:`<article class="panel practice-trends" aria-label="能力变化趋势">
  <div class="panel-head"><h2>能力变化趋势</h2><span>{{mode==='current'?'过去 52 周 · 按周取样':'按能力快照记录'}}</span></div>
  <div class="trend-controls">
   <label>评分口径<select v-model="mode"><option value="current">当前能力（随时间衰减）</option><option value="history">历史能力快照</option></select></label>
   <label>参考范围<select v-model="scope" aria-label="能力趋势参考范围">
    <option value="specialty">专职综合能力</option>
    <option value="all">全部题目综合能力</option>
    <option v-for="[key,name] in topics" :key="key" :value="'topic:'+key">{{name}}</option>
   </select></label>
  </div>
  <p v-if="error" class="error" role="alert">{{error}} <button @click="load">重试</button></p>
  <p v-if="loading" class="muted" role="status">正在读取能力快照…</p>
  <p v-else-if="latest" class="trend-summary" aria-live="polite">
   {{mode==='current'?'评估日期 '+formatDay(latest.at): '最近快照 '+formatTime(latest.at)}} ·
   <template v-if="current?.score!=null">CF 尺度 {{current.score}} 分 · 计分样本 {{current.count}} / {{current.limit}} 道{{current.count<current.limit?'（暂定）':''}}</template>
   <template v-else>当前范围暂无计分样本。</template>
  </p>
  <p v-if="scope==='specialty'&&latest?.specialty.names.length" class="muted">{{latest.specialty.names.join('、')}}{{latest.specialty.includeDescendants?'（含实线下级分支）':''}}</p>
  <div v-show="count" ref="chartEl" class="chart trend-chart" role="img" aria-label="CF 尺度能力参考值随时间变化"></div>
  <p v-if="hasBreak" class="muted">折线断开处表示计分范围或版本改变，或期间缺少可计分样本。</p>
  <p v-if="!loading&&!error&&count===1" class="muted">目前只有一个计分点，后续记录到变化时会显示趋势。</p>
  <p v-if="!loading&&!error&&!count" class="muted">当前范围暂无可绘制的能力快照。</p>
  <ModuleHelp><p v-if="mode==='current'" class="footnote">以当前题型配置和难度资料回算过去 52 周。每个点只使用当天及之前的 AC 记录，重复 AC 刷新日期，同源题只算一次。最近一次 AC 在 前 60 天不扣分，第 61 天起开始扣分，之后每 365 天，距离扣满 250 分的差额减半。入选题按最近一次 AC 加权平均，AC 日期每早 183 天，权重减半。没有逐题 AC 日期的题仅计入历史分。</p><p v-else class="footnote">从功能启用时开始记录。服务启动、同步成功或保存题型设置后，数值、样本或计分范围有变化才保存快照。专职综合最多取 100 道，全部题目综合最多取 150 道，单题型最多取 25 道；样本不足的分数为暂定值。样本上限、计分范围或评分版本改变时，折线会断开。图表最多显示最近 {{historyLimit||500}} 条快照，时间为北京时间。</p></ModuleHelp>
 </article>`
};
