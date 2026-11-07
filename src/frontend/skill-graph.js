import {graphScoreStyle,scoreStyle} from './score-color.js';
import {ref,computed,watch,onMounted,onBeforeUnmount,useId} from 'vue';
import {clampGraphAxis} from './graph-pan.js';
import {readLayoutPreferences} from './skill-layout-preferences.js';
import {createSkillLayout,skillLayoutBounds,skillViewSize} from './skill-layout.js';
import {families,extraRelations,skillGraph,customSkillGraph,nodeFontSize} from './skill-graph-model.js';
export default{
 props:{counts:Object,profiles:{type:Array,default:()=>[]},config:{type:Object,default:null}},emits:['inspect','clear-inspection'],
 setup(props,{emit}){
  const gradientId=useId()+'-skill-fill-';
  const preferences=readLayoutPreferences();
  const expanded=ref(['dp']),selected=ref('dp'),zoom=ref(100);
  const raw=computed(()=>props.config?customSkillGraph(props.profiles,expanded.value,props.config,props.counts):skillGraph(props.profiles,expanded.value)),positions=ref(new Map()),arranging=ref(false),layoutState=ref('idle'),iterations=ref(0);
  const displayed=ref({nodes:[],edges:[]});
  const layoutBounds=computed(()=>skillLayoutBounds(raw.value.nodes.length));
  let timer,frame;
  function cancelLayout(){
   clearTimeout(timer);
   cancelAnimationFrame(frame);
  }
  function arrange(){
   cancelLayout();
   const input=raw.value;
   const simulation=createSkillLayout(input,positions.value,{preferences});
   const animate=positions.value.size>0&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
   arranging.value=true;
   layoutState.value='running';
   let lastFrame=-Infinity;

   function publish(){
    positions.value=simulation.positions();
    displayed.value={...input,nodes:input.nodes.map(n=>({...n,...positions.value.get(n.id)}))};
   }

   function batch(timestamp){
    if(animate&&timestamp-lastFrame<32){
     frame=requestAnimationFrame(batch);
     return;
    }
    lastFrame=timestamp;
    const start=performance.now();
    let state;
    do{state=simulation.step(4);}
    while(!state.done&&performance.now()-start<4&&(!animate||state.steps%12!==0));

    if(animate||state.done)publish();
    if(state.done){
     iterations.value=state.steps;
     layoutState.value=state.reason;
     arranging.value=false;
    }else if(animate){
     frame=requestAnimationFrame(batch);
    }else{
     timer=setTimeout(batch,0);
    }
   }
   if(animate)frame=requestAnimationFrame(batch);
   else timer=setTimeout(batch,0);
  }
  watch(()=>raw.value.nodes.map(n=>n.id).join('|')+';'+raw.value.edges.map(e=>e.from+'>'+e.to).join('|'),arrange,{immediate:true});
  onBeforeUnmount(cancelLayout);
  const graph=computed(()=>{
   const latest=new Map(raw.value.nodes.map(n=>[n.id,n]));
   return {...displayed.value,known:raw.value.known,nodes:displayed.value.nodes.map(n=>({...n,...latest.get(n.id),x:n.x,y:n.y}))};
  });
  const index=computed(()=>new Map(graph.value.nodes.map(n=>[n.id,n])));
  const chosen=computed(()=>index.value.get(selected.value)||null);
  const allNodes=computed(()=>props.config?props.config.nodes.map(n=>({id:n.id,name:props.config.names[n.id]||props.profiles.find(p=>p.tag_name===n.id)?.display_name||n.id,family:n.parent||n.id})):families.flatMap(f=>[{id:f.id,name:f.name,family:f.id},...f.children.map(([id,name])=>({id,name,family:f.id}))]));
  const allIds=computed(()=>allNodes.value.map(n=>n.id));
  const related=computed(()=>{
   const id=selected.value,links=props.config?props.config.nodes.flatMap(n=>[...(n.parent?[[n.parent,n.id]]:[]),...n.secondary.map(p=>[p,n.id])]):[...families.flatMap(f=>f.children.map(([child])=>[f.id,child])),...extraRelations];
   return [...new Set(links.flatMap(([a,b])=>a===id?[b]:b===id?[a]:[]))].map(key=>allNodes.value.find(n=>n.id===key)).filter(Boolean);
  });
  const missing=computed(()=>props.profiles.filter(p=>!graph.value.known.has(p.tag_name)).length);
  function toggle(id){expanded.value=expanded.value.includes(id)?expanded.value.filter(x=>x!==id):[...expanded.value,id];selected.value=id;}
  function choose(id){const n=allNodes.value.find(n=>n.id===id);if(!n)return;if(props.config){let p=props.config.nodes.find(n=>n.id===id);const parents=[];while(p?.parent){parents.push(p.parent);p=props.config.nodes.find(n=>n.id===p.parent);}expanded.value=[...new Set([...expanded.value,...parents])];}else if(!expanded.value.includes(n.family))expanded.value=[...expanded.value,n.family];selected.value=id;}
  function click(n){if(n.root)toggle(n.id);else selected.value=n.id;}
  const canvas=ref(null),svg=ref(null),scene=ref(null),panning=ref(false);
  let pan={x:0,y:0},gesture,suppressClick=false;
  function moveView(x,y){
   pan={x,y};
   scene.value?.setAttribute('transform',`translate(${x} ${y})`);
  }
  function clampPan(x,y,inverse){
   const width=canvas.value.clientWidth*inverse.a;
   const height=canvas.value.clientHeight*inverse.d;
   const bounds=layoutBounds.value;
   moveView(
    -bounds.left-clampGraphAxis(-x-bounds.left,bounds.width,width),
    -bounds.top-clampGraphAxis(-y-bounds.top,bounds.height,height)
   );
  }
  function constrainView(){
   const matrix=svg.value?.getScreenCTM();
   if(matrix?.a>0&&matrix.d>0)clampPan(pan.x,pan.y,matrix.inverse());
  }
  watch(layoutBounds,constrainView,{flush:'post'});
  let resizeObserver;
  onMounted(()=>{
   resizeObserver=new ResizeObserver(constrainView);
   resizeObserver.observe(canvas.value);
   resizeObserver.observe(svg.value);
  });
  onBeforeUnmount(()=>resizeObserver?.disconnect());
  function startPan(event){
   if(event.pointerType!=='mouse'||event.button!==0)return;
   suppressClick=false;
   const matrix=svg.value?.getScreenCTM();
   if(!matrix?.a||!matrix.d)return;
   gesture={id:event.pointerId,x:event.clientX,y:event.clientY,origin:pan,inverse:matrix.inverse()};
  }
  function movePan(event){
   if(gesture?.id!==event.pointerId)return;
   const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y;
   if(!panning.value){
    if(Math.hypot(dx,dy)<4)return;
    canvas.value.setPointerCapture(event.pointerId);
    panning.value=true;
    suppressClick=true;
   }
   // The inverse linear transform converts screen movement to SVG units at any zoom.
   const {a,b,c,d}=gesture.inverse;
   clampPan(gesture.origin.x+a*dx+c*dy,gesture.origin.y+b*dx+d*dy,gesture.inverse);
  }
  function endPan(event){
   if(gesture?.id!==event.pointerId)return;
   gesture=null;
   panning.value=false;
  }
  function leaveCanvas(event){if(!panning.value)endPan(event);}
  function clearSelection(){selected.value='';emit('clear-inspection');}
  function canvasClick(event){
   if(suppressClick&&event.detail>0){event.stopPropagation();suppressClick=false;return;}
   if(!event.target.closest('.skill-node'))clearSelection();
  }
  function reset(){moveView(0,0);positions.value=new Map();arrange();expanded.value=['dp'];selected.value='dp';zoom.value=100;}
  function edgePath(e){
   const a=index.value.get(e.from),b=index.value.get(e.to),dx=b.x-a.x,dy=b.y-a.y,d=Math.max(1,Math.hypot(dx,dy));
   const start=a.size/2+2,end=b.size/2+8;
   return 'M '+(a.x+dx/d*start)+' '+(a.y+dy/d*start)+' L '+(b.x-dx/d*end)+' '+(b.y-dy/d*end);
  }
  function connected(e){return e.from===selected.value||e.to===selected.value;}
  return {gradientId,graphScoreStyle,scoreStyle,skillViewSize,canvas,svg,scene,panning,startPan,movePan,endPan,leaveCanvas,canvasClick,clearSelection,nodeFontSize,arranging,layoutState,iterations,families,allIds,expanded,selected,zoom,graph,index,chosen,allNodes,related,missing,toggle,choose,click,reset,connected,edgePath};
 },
 template:`<section class="skill-graph" aria-label="题型知识图谱">
  <div class="skill-controls"><label>定位题型<select :value="selected" @change="$event.target.value?choose($event.target.value):clearSelection()" aria-label="定位知识图谱题型"><option value="">未选中题型</option><option v-for="n in allNodes" :key="n.id" :value="n.id">{{n.name}}</option></select></label><label>缩放 <input v-model.number="zoom" type="range" min="25" max="150" step="5" aria-label="知识图谱缩放">{{zoom}}%</label><button @click="expanded=allIds">展开全部</button><button @click="reset">重置视图</button></div>
  <div class="skill-legend"><span>节点按能力参考分着色</span><span v-for="score in [0,1300,1500,1750,2000,2250,2800,4500]" :key="score" class="score-chip" :style="graphScoreStyle(score)">{{score}}</span><span>● 暂无评分</span></div>
  <p class="footnote skill-layout-status" role="status">{{arranging?'正在自动排布，完成后将静止显示…':'拖动查看图谱，点击空白处取消选择。'}}</p>
  <div ref="canvas" class="skill-canvas" :class="{panning}" @pointerdown="startPan" @pointermove="movePan" @pointerup="endPan" @pointercancel="endPan" @lostpointercapture="endPan" @pointerleave="leaveCanvas" @click.capture="canvasClick" @keydown.esc="clearSelection" :aria-busy="arranging" :data-layout-state="layoutState" :data-layout-steps="iterations" tabindex="0" aria-label="可拖动查看的知识图谱">
   <svg ref="svg" :viewBox="'0 0 '+skillViewSize.width+' '+skillViewSize.height" :style="{width:zoom+'%',minWidth:(900*zoom/100)+'px'}" role="group" aria-label="题型知识关系节点与连线">
    <defs><marker id="skill-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="context-stroke" /></marker>
     <radialGradient v-for="(n,i) in graph.nodes" :key="n.id" :id="gradientId+i">
      <stop offset="30%" :stop-color="n.fill" />
      <stop offset="100%" :stop-color="'color-mix(in srgb, '+n.fill+' 68%, black)'" />
     </radialGradient>
    </defs>
    <g ref="scene">
    <g v-for="e in graph.edges" :key="e.from+'>'+e.to" class="skill-edge" :class="{related:e.kind==='related',highlight:connected(e)}"><path :d="edgePath(e)" marker-end="url(#skill-arrow)" /></g>
    <g v-for="(n,i) in graph.nodes" :key="n.id" role="button" tabindex="0" :aria-label="n.name+'，已同步通过 '+n.count+' 题'+(n.root?'，点击展开或收起分支':'，点击查看统计')" :aria-pressed="selected===n.id" @click="click(n)" @keydown.enter.prevent="click(n)" @keydown.space.prevent="click(n)" class="skill-node" :class="{selected:selected===n.id}" :style="{'--node':n.fill,'--node-ink':n.ink}">
     <title>{{n.row?.display_name||n.name}}：实线子树共 {{n.count}} 道通过题；能力参考 {{n.row?.ability_value??'暂无'}}；样本 {{n.row?.sample_count||0}} / {{n.row?.sample_limit??20}}</title>
     <circle :cx="n.x" :cy="n.y" :r="n.size/2" :fill="'url(#'+gradientId+i+') '+n.fill"/><text :x="n.x" :y="n.y" text-anchor="middle" dominant-baseline="central" :style="{fontSize:nodeFontSize(n.count,n.size)+'px'}" class="skill-count">{{n.count}}</text><text :x="n.x" :y="n.y+n.size/2+20" text-anchor="middle" class="skill-label">{{n.name}}{{n.root?(expanded.includes(n.id)?' −':' +'):''}}</text>
    </g>
    </g>
   </svg>
  </div>
  <section v-if="chosen" class="skill-detail" aria-label="图谱节点详情"><div class="panel-head"><h3>{{chosen.row?.display_name||chosen.name}}</h3><span>实线子树 {{chosen.count}} 道通过题</span></div><p>CF 尺度参考值：<span :class="{'score-chip':scoreStyle(chosen.row?.ability_value)}" :style="scoreStyle(chosen.row?.ability_value)">{{chosen.row?.ability_value??'暂无'}}</span> · {{chosen.row?.sample_count||0}} / {{chosen.row?.sample_limit??20}} 题</p><button v-if="chosen.row?.sample_count>0" @click="$emit('inspect',chosen.row)">查看该题型入选题单</button><p class="footnote">相关知识：<template v-for="(n,i) in related" :key="n.id"><span v-if="i"> · </span><button class="skill-related-button" @click="choose(n.id)">{{n.name}}</button></template><span v-if="!related.length">暂无已整理关系</span></p></section>
  <ModuleHelp>
  <p class="footnote">拖动空白处平移，滑块可调整缩放。点击节点查看详情，点击空白处或按 Esc 清除选择。节点越大，去重通过题数越多；实线为基础与分支，虚线为跨方向关联。它们是人工整理的知识关系，不代表严格学习前置。</p>
  <p class="footnote">当前关系图共 {{graph.known.size}} 个节点；当前筛选还有 {{missing}} 个标签未纳入关系图，可在表格中查看。节点题数包含自身与全部实线下级的去重通过题，虚线关联不计入。能力参考与入选题单仍按当前题型计算。灰色表示暂无评分，白色对应 0 分。节点内的题数根据底色自动使用黑字或白字。评分沿用题型能力参考，不是个人 CF rating。</p>
  </ModuleHelp>
 </section>`
};
