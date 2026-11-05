import {completePositions,forestPositions} from './topology-editor-layout.js';
import {ref,computed,watch} from 'vue';
import ChoicePicker from './choice-picker.js';
import {canPlace,editorNode} from '../shared/topology-geometry.js';
import {graphEdges,edgeKey} from '../shared/topology-merge.js';
const clone=v=>JSON.parse(JSON.stringify(v));
export default{
 components:{ChoicePicker},props:{modelValue:{type:Object,required:true},catalog:Array},emits:['update:modelValue'],
 setup(props,{emit}){
  const renameText=ref(''),showCreate=ref(false);
  const zoomLevels=[25,40,50,60,70,75,80,90,100,110,125,140,150,175,200,225,250,275,300];
  const svg=ref(null),mode=ref('move'),selected=ref(''),selectedEdge=ref(''),from=ref(''),adding=ref(''),message=ref(''),positions=ref({}),zoom=ref(100),pan=ref({x:0,y:0}),history=ref([]);let gesture=null;
  const committedPositions=computed(()=>completePositions(props.modelValue.nodes,props.modelValue.positions));
  watch(committedPositions,value=>{positions.value=value;if(!props.modelValue.nodes.some(n=>n.id===selected.value))selected.value='';},{immediate:true});
  const nodes=computed(()=>props.modelValue.nodes),edges=computed(()=>graphEdges(nodes.value));
  const name=id=>props.modelValue.names[id]||props.catalog.find(t=>t.key===id)?.name||id;
  const candidates=computed(()=>props.catalog.filter(t=>!nodes.value.some(n=>n.id===t.key)).map(t=>({key:t.key,label:name(t.key),hint:t.key})));
  watch(selected,id=>{renameText.value=id?name(id):'';});
  const options=computed(()=>nodes.value.map(n=>({key:n.id,label:name(n.id),hint:n.id})));
  const bounds=computed(()=>({width:Math.max(900,...Object.values(committedPositions.value).map(p=>p.x+110)),height:Math.max(560,...Object.values(committedPositions.value).map(p=>p.y+80))}));
  const viewBox=computed(()=>{const scale=100/zoom.value;return [pan.value.x,pan.value.y,bounds.value.width*scale,bounds.value.height*scale].join(' ');});
  function commit(next){history.value=[...history.value.slice(-39),clone(props.modelValue)];emit('update:modelValue',next);}
  function update(fn){const next=clone(props.modelValue);next.positions=clone(positions.value);fn(next);commit(next);}
  function undo(){const last=history.value.pop();if(last)emit('update:modelValue',last);from.value='';message.value='已撤销上一步。';}
  function point(e){const p=svg.value.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.value.getScreenCTM().inverse());}
  function down(e,n){if(e.button!==0)return;
   if(mode.value!=='move'&&from.value){activate(n);return;}
   activate(n);message.value='';e.preventDefault();const p=point(e);gesture={id:n.id,start:p,origin:{...positions.value[n.id]},moved:false};svg.value.setPointerCapture(e.pointerId);
  }
  function clearSelection(){selected.value='';selectedEdge.value='';from.value='';mode.value='move';showCreate.value=false;message.value='已取消选择。';}
  function selectEdge(e){selectedEdge.value=edgeKey(e);selected.value='';from.value='';mode.value='move';showCreate.value=false;}
  function startConnection(kind){mode.value=kind;from.value=selected.value;message.value='请点击后继节点，空白处可取消连线。';}
  function activate(n){if(mode.value!=='move'&&from.value){connect(from.value,n.id);from.value='';mode.value='move';}selected.value=n.id;selectedEdge.value='';showCreate.value=false;}
  function reforest(){update(c=>c.positions=forestPositions(c.nodes));zoom.value=100;pan.value={x:0,y:0};message.value='已按主树重新排列为森林，可撤销。';}
  function changeZoom(next){const previous=zoom.value,value=Math.max(25,Math.min(300,Number(next)||100));pan.value={x:pan.value.x+bounds.value.width*(100/previous-100/value)/2,y:pan.value.y+bounds.value.height*(100/previous-100/value)/2};zoom.value=value;}
  function stepZoom(delta){const next=delta>0?zoomLevels.find(v=>v>zoom.value):[...zoomLevels].reverse().find(v=>v<zoom.value);if(next)changeZoom(next);}
  function background(e){if(e.button!==0||e.target!==svg.value)return;clearSelection();const p=point(e);gesture={pan:true,start:p,origin:{...pan.value}};svg.value.setPointerCapture(e.pointerId);}
  function move(e){if(!gesture)return;const p=point(e);if(gesture.pan){pan.value={x:gesture.origin.x-(p.x-gesture.start.x),y:gesture.origin.y-(p.y-gesture.start.y)};gesture.start=point(e);gesture.origin={...pan.value};return;}
   const next={x:Math.max(90,Math.min(10000,gesture.origin.x+p.x-gesture.start.x)),y:Math.max(50,Math.min(10000,gesture.origin.y+p.y-gesture.start.y))};
   if(canPlace(gesture.id,next,positions.value)){positions.value={...positions.value,[gesture.id]:next};gesture.moved=true;}else message.value='此位置与其他节点重叠，已保留最近合法位置。';
  }
  function up(e){if(!gesture)return;const g=gesture;gesture=null;if(svg.value.hasPointerCapture(e.pointerId))svg.value.releasePointerCapture(e.pointerId);if(!g.pan&&g.moved){const next=clone(props.modelValue);next.positions=clone(positions.value);commit(next);}}
  function connect(a,b){if(a===b){message.value='不能连接节点自身。';return;}const next=clone(props.modelValue),n=next.nodes.find(n=>n.id===b),kind=mode.value==='primary'?'primary':'secondary';
   if(n.parent===a||n.secondary.includes(a)){message.value='这两个节点已有同方向连线。';return;}
   if(kind==='secondary'&&n.parent===null){message.value='根节点不能有副前驱，请先连主前驱。';return;}
   if(kind==='primary')n.parent=a;else n.secondary.push(a);
   const links=graphEdges(next.nodes),seen=new Set();function reaches(id){if(id===a)return true;if(seen.has(id))return false;seen.add(id);return links.filter(e=>e.from===id).some(e=>reaches(e.to));}
   if(reaches(b)){message.value='这条连线会产生环，已阻止。';return;}
   next.positions=clone(positions.value);commit(next);message.value=kind==='primary'?'主前驱已连接，替换原主前驱。':'副前驱已连接。';
  }
  function addNode(){if(!adding.value)return;const id=adding.value;update(c=>{c.nodes.push({id,parent:null,secondary:[]});c.positions=completePositions(c.nodes,c.positions);});selected.value=id;adding.value='';message.value='已添加独立根节点，可拖动或连线。';}
  function removeNode(){if(!selected.value)return;const id=selected.value;update(c=>{c.nodes=c.nodes.filter(n=>n.id!==id).map(n=>({...n,parent:n.parent===id?null:n.parent,secondary:n.secondary.filter(p=>p!==id)}));delete c.positions[id];});selected.value='';message.value='节点及相连边已从草稿移除；题型与刷题数据保留。失去主前驱的下级成为根，请检查剩余副前驱。';}
  function removeEdge(){const e=edges.value.find(e=>edgeKey(e)===selectedEdge.value);if(!e)return;update(c=>{const n=c.nodes.find(n=>n.id===e.to);if(e.kind==='primary')n.parent=null;else n.secondary=n.secondary.filter(p=>p!==e.from);});selectedEdge.value='';message.value='连线已移除，请检查根节点与前驱约束。';}
  function rename(){const value=renameText.value.trim();if(!value||!selected.value)return;update(c=>c.names[selected.value]=value);}
  function locate(id){selected.value=id;selectedEdge.value='';from.value='';mode.value='move';showCreate.value=false;const p=positions.value[id];if(p){zoom.value=150;pan.value={x:Math.max(0,p.x-250),y:Math.max(0,p.y-180)};}}
  const line=e=>{const a=positions.value[e.from],b=positions.value[e.to],dx=b.x-a.x,dy=b.y-a.y,bend=Math.min(120,Math.max(35,Math.abs(dx)*.2));const c={x:(a.x+b.x)/2+(Math.abs(dx)<20?bend:0),y:(a.y+b.y)/2+(e.kind==='secondary'?bend:-bend)};
   function clip(p){const vx=c.x-p.x,vy=c.y-p.y,t=Math.min(80/Math.max(.001,Math.abs(vx)),32/Math.max(.001,Math.abs(vy)));return {x:p.x+vx*t,y:p.y+vy*t};}const start=clip(a),end=clip(b);return 'M '+start.x+','+start.y+' Q '+c.x+','+c.y+' '+end.x+','+end.y;};
  return {zoomLevels,showCreate,clearSelection,selectEdge,startConnection,activate,reforest,changeZoom,stepZoom,renameText,svg,mode,selected,selectedEdge,from,adding,message,positions,zoom,pan,history,nodes,edges,name,candidates,options,viewBox,editorNode,edgeKey,down,background,move,up,connect,addNode,removeNode,removeEdge,rename,locate,line,undo};
 },
 template:`<section class="topology-editor" aria-label="交互式拓扑编辑器" @keydown.esc.prevent="clearSelection">
 <div class="topology-toolbar"><div class="context-actions" aria-label="选中对象操作">
 <button v-if="!selected&&!selectedEdge" @click="showCreate=!showCreate" :aria-expanded="showCreate">创建新节点</button>
 <template v-if="selected"><span class="footnote">节点：{{name(selected)}}</span><button @click="removeNode">删除节点</button><button :aria-pressed="mode==='primary'" @click="startConnection('primary')">连接主前驱</button><button :aria-pressed="mode==='secondary'" @click="startConnection('secondary')">连接副前驱</button><button @click="clearSelection">取消选择</button></template>
 <template v-if="selectedEdge"><span class="footnote">已选中边</span><button @click="removeEdge">删除边</button><button @click="clearSelection">取消选择</button></template>
 </div><div class="view-actions"><button @click="undo" :disabled="!history.length">撤销上一步</button><button @click="reforest">重新排列为森林</button><button @click="stepZoom(-1)" :disabled="zoom<=25" aria-label="缩小编辑画布">−</button><label>缩放<select :value="zoom" @change="changeZoom($event.target.value)" aria-label="编辑画布缩放"><option v-for="v in zoomLevels" :key="v" :value="v">{{v}}%</option></select></label><button @click="stepZoom(1)" :disabled="zoom>=300" aria-label="放大编辑画布">＋</button><button @click="zoom=100;pan={x:0,y:0}">适应画布</button></div></div>
 <div v-if="showCreate&&!selected&&!selectedEdge" class="topology-tools"><ChoicePicker v-model="adding" :items="candidates" label="添加图谱题型" /><button :disabled="!adding" @click="addNode();showCreate=false">添加节点</button></div>
 <div class="editor-inspector"><ChoicePicker :model-value="selected" @update:model-value="locate" :items="options" label="定位编辑节点" :clearable="false" /><div v-if="selected" class="editor-selection"><label>选中节点显示名<input v-model="renameText" maxlength="100" aria-label="选中节点显示名"></label><button :disabled="!renameText.trim()||renameText.trim()===name(selected)" @click="rename">更新节点名称</button></div></div>
 <p class="footnote">各棵树按实线主前驱独立排列，虚线只表示关联。拖节点移动、拖空白处平移；点击空白或按 Esc 取消选择。选中节点后可发起连线，再点击后继节点。编辑时无物理模拟。</p><p class="editor-status" role="status">{{message||'点击节点、边或空白处切换操作。'}}{{from?' 起点：'+name(from):''}}</p>
 <svg ref="svg" class="topology-canvas" :viewBox="viewBox" role="group" aria-label="技能拓扑编辑画布" @pointerdown="background" @pointermove="move" @pointerup="up" @pointercancel="up" tabindex="0"><defs><marker id="editor-arrow" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="context-stroke" /></marker></defs>
 <g v-for="e in edges" :key="edgeKey(e)" class="editor-edge" :class="{secondary:e.kind==='secondary',chosen:selectedEdge===edgeKey(e)||selected===e.from||selected===e.to}" @pointerdown.stop="selectEdge(e)" @click.stop="selectEdge(e)" role="button" tabindex="0" :aria-label="(e.kind==='primary'?'主前驱':'副前驱')+'连线：'+name(e.from)+' → '+name(e.to)" @keydown.enter="selectEdge(e)"><path :d="line(e)" class="edge-hit"/><path :d="line(e)" marker-end="url(#editor-arrow)" /></g>
 <g v-for="n in nodes" :key="n.id" class="editor-node" :class="{selected:selected===n.id,start:from===n.id}" :transform="'translate('+positions[n.id].x+','+positions[n.id].y+')'" role="button" tabindex="0" :aria-label="'编辑节点：'+name(n.id)" @pointerdown.stop="down($event,n)" @keydown.enter.prevent="activate(n)"><rect x="-80" y="-32" width="160" height="64" rx="10"/><text y="-3" text-anchor="middle">{{name(n.id).split(' / ')[0].slice(0,12)}}</text><text y="17" text-anchor="middle" class="editor-node-key">{{n.parent===null?'根节点 · ':''}}{{n.id.slice(0,21)}}</text><title>{{name(n.id)}} · {{n.id}}</title></g></svg>
 </section>`
};
