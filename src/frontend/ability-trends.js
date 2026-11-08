import {scoreStyle,scoreColor,scoreAxisColor} from './score-color.js';
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
  if(previous&&(previous.version!==snapshot.version||previous.metric.scope!==metric.scope)){
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
  function hover({offsetX,offsetY}){
   const pixel=[offsetX,offsetY];
   if(chart.containPixel({gridIndex:0},pixel)){
    const [time,score]=chart.convertFromPixel({gridIndex:0},pixel);
    const samples=points.value;
    const rightIndex=samples.findIndex(point=>point.value[0]>=time);
    const right=samples[rightIndex];
    const left=right?.value[0]===time?right:samples[rightIndex-1];
    if(left?.metric&&right?.metric){
     const [leftTime,leftScore]=left.value,[rightTime,rightScore]=right.value;
     const fraction=leftTime===rightTime?0:(time-leftTime)/(rightTime-leftTime);
     if(score<=leftScore+(rightScore-leftScore)*fraction){
      const dataIndex=fraction<.5&&left!==right?rightIndex-1:rightIndex;
      chart.dispatchAction({type:'showTip',seriesIndex:0,dataIndex});
      return;
     }
    }
   }
   chart.dispatchAction({type:'hideTip'});
  }
  function draw(){
   if(!count.value||!chartEl.value){
    chart?.dispose();chart=null;return;
   }
   if(!chart){
    chart=echarts.init(chartEl.value);
    chart.getZr().on('mousemove',hover);
    chart.getZr().on('globalout',()=>chart?.dispatchAction({type:'hideTip'}));
   }
   const css=getComputedStyle(document.documentElement),token=name=>css.getPropertyValue(name).trim();
   const data=points.value.map(point=>point.metric?{
    ...point,itemStyle:{color:scoreColor(point.metric.score),borderColor:token('--muted'),borderWidth:1}
   }:point);
   const scored=data.filter(point=>point.metric);
   const start=scored[0].value[0],span=scored.at(-1).value[0]-start;
   const areaColor=span?{
    type:'linear',x:0,y:0,x2:1,y2:0,
    colorStops:scored.map(point=>({offset:(point.value[0]-start)/span,color:point.itemStyle.color}))
   }:scored[0].itemStyle.color;
   chart.setOption({animation:false,color:[token('--green')],
    grid:{left:58,right:22,top:20,bottom:35},
    tooltip:{trigger:'item',triggerOn:'none',renderMode:'richText',backgroundColor:token('--panel'),borderColor:token('--border'),
     textStyle:{color:token('--text')},formatter:({data})=>{
      if(!data?.metric)return '';
      const {metric,value}=data;
      const lines=[timestamp.format(value[0]),'CF 尺度 '+metric.score+' 分','计分样本 '+metric.count+' / '+metric.limit+' 道'];
      if(metric.names?.length)lines.push(metric.names.join('、'));
      return lines.join('\n');
     }},
    xAxis:{type:'time',axisLabel:{color:token('--muted'),hideOverlap:true,formatter:date=>dateLabel.format(date)},
     axisLine:{lineStyle:{color:token('--border')}}},
    yAxis:{type:'value',scale:true,minInterval:1,axisLabel:{color:value=>scoreAxisColor(value,token('--panel'))},splitLine:{lineStyle:{color:token('--rowBorder')}}},
    series:[{type:'line',showSymbol:true,symbolSize:7,connectNulls:false,
     areaStyle:{origin:'start',color:areaColor,opacity:.22},data}]},true);
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
  return {scoreStyle,snapshots,historyLimit,scope,mode,chartEl,loading,error,latest,topics,current,count,hasBreak,load,formatTime,formatDay};
 },
 template:`<article class="panel practice-trends" aria-label="能力变化趋势">
  <div class="panel-head"><h2>能力变化趋势</h2><span>{{mode==='current'?'过去 52 周 · 按周取样':'按能力快照记录'}}</span></div>
  <div class="trend-controls">
   <label>评分口径<select v-model="mode"><option value="current">当前能力（随时间衰减）</option><option value="history">历史能力快照</option></select></label>
   <label>参考范围<select v-model="scope" aria-label="能力趋势参考范围">
    <option value="specialty">专职综合能力</option>
    <option value="all">全部题目综合能力（排除 QOJ）</option>
    <option v-for="[key,name] in topics" :key="key" :value="'topic:'+key">{{name}}</option>
   </select></label>
  </div>
  <p v-if="error" class="error" role="alert">{{error}} <button @click="load">重试</button></p>
  <LoadingNotice v-if="loading" :skeleton="!latest">正在读取能力快照…</LoadingNotice>
  <p v-if="latest" class="trend-summary" aria-live="polite">
   {{mode==='current'?'评估日期 '+formatDay(latest.at): '最近快照 '+formatTime(latest.at)}} ·
   <template v-if="current?.score!=null">CF 尺度 <span :class="{'score-chip':scoreStyle(current.score)}" :style="scoreStyle(current.score)">{{current.score}}</span> 分 · 计分样本 {{current.count}} / {{current.limit}} 道{{current.count<current.limit?'（缺额计零）':''}}</template>
   <template v-else>当前范围暂无计分样本。</template>
  </p>
  <p v-if="scope==='specialty'&&latest?.specialty.names.length" class="muted">{{latest.specialty.names.join('、')}}{{latest.specialty.includeDescendants?'（含实线下级分支）':''}}</p>
  <div v-show="count" :class="{'content-ready':count>0}" ref="chartEl" class="chart trend-chart" role="img" aria-label="CF 尺度能力参考值随时间变化"></div>
  <p v-if="hasBreak" class="muted">折线断开处表示计分范围或版本改变，或期间缺少可计分样本。</p>
  <p v-if="!loading&&!error&&count===1" class="muted">目前只有一个计分点，后续记录到变化时会显示趋势。</p>
  <p v-if="!loading&&!error&&!count" class="muted">当前范围暂无可绘制的能力快照。</p>
  <ModuleHelp>
  <h4>统计范围</h4><p>各参考范围的能力分均排除 QOJ。横轴为北京时间。</p>
  <h4>{{mode==='current'?'当前能力如何回算':'历史能力何时记录'}}</h4>
  <p v-if="mode==='current'" class="footnote">以当前题型配置和难度资料回算过去 52 周的周日和今天。每个点只使用当天及之前的 AC 记录，重复 AC 刷新日期，同源题只算一次。</p><p v-if="mode==='current'" class="footnote">最近一次 AC 后前 20 天不扣分，第 21 天起开始扣分，之后每 365 天，距离扣满 250 分的差额减半。有日期的有效题中取最高 15%，单题型、专职和全部题目分别至少取 20、125 和 250 道，缺额按零分计入。入选题按最近一次 AC 加权平均，AC 日期每早 183 天，权重减半。没有逐题 AC 日期的题仅计入历史分。</p><p v-else class="footnote">从功能启用时开始记录。服务启动、同步成功或保存题型设置后，数值、样本或计分范围有变化才保存快照。取最高 15%（向上取整），专职至少 125 道，全部题目至少 250 道，单题型至少 20 道。缺额按零分计入。计分范围或评分版本改变时，折线会断开。图表最多显示最近 {{historyLimit||500}} 条快照，时间为北京时间。</p>
  </ModuleHelp>
 </article>`
};
