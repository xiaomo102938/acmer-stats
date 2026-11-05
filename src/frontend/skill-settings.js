import {apiFetch} from './api-fetch.js';
import {completePositions} from './topology-editor-layout.js';
import ChoicePicker from './choice-picker.js';
import TopologyEditor from './topology-editor.js';
import {ref,computed,onMounted,watch} from 'vue';
import {validateSkills,specialtyKeys} from '../shared/skill-settings.js';
import {mergeTopology,edgeKey} from '../shared/topology-merge.js';
import {topologyContentSignature} from '../shared/topology-geometry.js';
const clone=v=>JSON.parse(JSON.stringify(v));
const specialty=c=>({specialties:clone(c.specialties),includeDescendants:c.includeDescendants});
const topology=c=>({nodes:clone(c.nodes),names:clone(c.names),positions:completePositions(c.nodes,c.positions)});
export default{
 components:{ChoicePicker,TopologyEditor},emits:['saved'],
 props:{cardPositions:{type:Object,default:()=>({})}},
 setup(_props,{emit}){
  const base=ref(null),catalog=ref([]),revision=ref(0),draftRevision=ref(0),storedDraft=ref(null),sDraft=ref(null),tDraft=ref(null),editorKey=ref(0),busy=ref(false),error=ref(''),message=ref(''),first=ref(''),second=ref(''),preview=ref(false),drop=ref([]),mergeName=ref(''),undoSource=ref('');
  const needsReload=ref(false);
  const name=id=>base.value?.names[id]||catalog.value.find(t=>t.key===id)?.name||id;
  const standard=computed(()=>catalog.value.filter(t=>!Object.hasOwn(base.value?.aliases||{},t.key)));
  const choices=computed(()=>standard.value.map(t=>({key:t.key,label:name(t.key),hint:t.key})));
  const sDirty=computed(()=>!!base.value&&JSON.stringify(sDraft.value)!==JSON.stringify(specialty(base.value)));
  const tDirty=computed(()=>!!base.value&&topologyContentSignature(tDraft.value)!==topologyContentSignature(base.value));
  const draftDirty=computed(()=>!!base.value&&topologyContentSignature(tDraft.value)!==topologyContentSignature(storedDraft.value||base.value));
  const coverage=computed(()=>base.value?specialtyKeys({...base.value,...sDraft.value}).size:0);
  const conflict=computed(()=>{if(!base.value)return '';try{validateSkills({...base.value,...tDraft.value},catalog.value);return '';}catch(e){return e.message;}});
  const draftConflict=computed(()=>{if(!base.value)return '';try{validateSkills({...base.value,...tDraft.value},catalog.value,{draft:true});return '';}catch(e){return e.message;}});
  const plan=computed(()=>{if(!preview.value)return null;try{return mergeTopology(base.value,first.value,second.value,catalog.value,drop.value);}catch(e){return {conflict:e.message};}});
  const mergeBlocked=computed(()=>sDirty.value||tDirty.value||!!storedDraft.value);
  watch([first,second],()=>{preview.value=false;drop.value=[];undoSource.value='';});
  async function load(){busy.value=true;error.value='';needsReload.value=false;try{const r=await apiFetch('/api/skill-settings');const b=await r.json();if(!r.ok)throw Error(b.message);base.value=b.config;catalog.value=b.catalog;revision.value=b.revision;draftRevision.value=b.draftRevision;storedDraft.value=b.topologyDraft;sDraft.value=specialty(b.config);tDraft.value=b.topologyDraft?clone(b.topologyDraft):topology(b.config);editorKey.value++;preview.value=false;undoSource.value='';}catch(e){error.value=e.message;}finally{busy.value=false;}}
  async function save(module){busy.value=true;error.value='';message.value='';try{
   if(['merge','unmerge'].includes(module)&&mergeBlocked.value)throw Error('请先保存或撤销专职修改，并应用或放弃拓扑草稿，再归并标签。');
   const body={module,revision:revision.value,draftRevision:draftRevision.value};
   if(module==='specialty')body.value=clone(sDraft.value);
   if(module==='topology'||module==='draft')body.value=clone(tDraft.value);
   if(module==='merge'){if(!plan.value?.config||plan.value.conflict)throw Error(plan.value?.conflict||'请先预览归并结果。');Object.assign(body,{first:first.value,second:second.value,drop:drop.value,name:mergeName.value});}
   if(module==='unmerge')body.source=undoSource.value;
   const r=await apiFetch('/api/skill-settings',{method:'PATCH',headers:{'Content-Type':'application/json','X-Acmer-Request':'1'},body:JSON.stringify(body)});const b=await r.json();if(!r.ok){needsReload.value=r.status===409;throw Error(b.message);}
   base.value=b.config;revision.value=b.revision;draftRevision.value=b.draftRevision;storedDraft.value=b.topologyDraft;
   if(module==='specialty')sDraft.value=specialty(b.config);
   if(module==='topology'||module==='discardDraft'){tDraft.value=topology(b.config);editorKey.value++;}
   if(module==='merge'||module==='unmerge'){sDraft.value=specialty(b.config);tDraft.value=topology(b.config);editorKey.value++;preview.value=false;undoSource.value='';first.value='';second.value='';}
   message.value=b.message;if(module!=='draft'&&module!=='discardDraft')emit('saved');
  }catch(e){error.value=e.message;}finally{busy.value=false;}}
  function previewMerge(){error.value='';if(mergeBlocked.value){error.value='请先保存或撤销其他模块的修改，并应用或放弃拓扑草稿。';return;}preview.value=true;drop.value=[];undoSource.value='';if(plan.value?.config)mergeName.value=name(plan.value.keep);}
  function cancelSpecialty(){sDraft.value=specialty(base.value);}
  function cancelTopology(){tDraft.value=storedDraft.value?clone(storedDraft.value):topology(base.value);editorKey.value++;}
  function cancelMerge(){preview.value=false;drop.value=[];undoSource.value='';first.value='';second.value='';}
  onMounted(load);
  return {needsReload,base,catalog,revision,storedDraft,sDraft,tDraft,editorKey,busy,error,message,first,second,preview,drop,mergeName,undoSource,name,standard,choices,sDirty,tDirty,draftDirty,coverage,conflict,draftConflict,plan,mergeBlocked,load,save,previewMerge,cancelSpecialty,cancelTopology,cancelMerge,edgeKey};
 },
 template:`<section class="skill-settings" aria-label="题型与技能图谱设置"><article v-if="error && (!base || needsReload)" class="panel" aria-label="题型与图谱设置恢复">
  <p class="error" role="alert">{{error}}</p>
  <button :disabled="busy" @click="load">{{base?'重新加载题型与图谱设置（放弃未保存编辑）':'重试加载题型与图谱设置'}}</button>
 </article><p v-else-if="error" class="error" role="alert">{{error}}</p><p v-if="message" role="status">{{message}}</p>
 <fieldset v-if="base" :disabled="busy" class="skill-fields">
 <article class="panel" :style="{order:cardPositions.specialty}" aria-label="专职题型设置"><div class="panel-head module-head"><h2>专职题型</h2><div><button class="module-save" :class="{dirty:sDirty}" :disabled="!sDirty" @click="save('specialty')">保存专职修改</button><button :disabled="!sDirty" @click="cancelSpecialty">撤销专职修改</button></div></div>
 <ChoicePicker v-model="sDraft.specialties" :items="choices" label="专职题型" multiple /><label class="skill-check"><input type="checkbox" v-model="sDraft.includeDescendants">包含实线下级分支（不沿虚线扩展）</label><p class="footnote">已选 {{sDraft.specialties.length}} 个专职，覆盖 {{coverage}} 个题型。</p><ModuleHelp><p class="footnote">可多选专职题型。综合能力从专职范围选最高 15% 的有效评分通过题，至少 125 道，缺额按零分计入。此模块独立保存，不应用未保存的拓扑。</p></ModuleHelp></article>
 <article class="panel" :style="{order:cardPositions.aliases}" aria-label="标签类型归并设置"><div class="panel-head module-head"><h2>标签类型归并</h2><div><button class="module-save" :class="{dirty:preview||undoSource}" :disabled="mergeBlocked||(!undoSource&&(!plan?.config||!!plan.conflict||!mergeName.trim()))" @click="save(undoSource?'unmerge':'merge')">保存归并修改</button><button :disabled="!preview&&!undoSource&&!first&&!second" @click="cancelMerge">撤销归并草稿</button></div></div>
 <p v-if="mergeBlocked" class="error">其他模块尚有修改或拓扑草稿，请先保存、应用或撤销，再归并。</p>
 <div class="skill-edit-row"><ChoicePicker v-model="first" :items="choices" label="第一个归并题型" /><ChoicePicker v-model="second" :items="choices.filter(t=>t.key!==first)" label="第二个归并题型" /><button :disabled="!first||!second||mergeBlocked" @click="previewMerge">预览节点归并</button></div>
 <section v-if="preview&&plan" class="merge-preview" aria-label="归并结果预览"><p v-if="plan.config">保留节点：{{name(plan.keep)}}；并入节点：{{name(plan.remove)}}。位置采用较浅节点（深度 {{plan.shallower}}），自动去除自环及重复边。</p><label v-if="plan.config">合并后显示名称<input v-model="mergeName" maxlength="100" aria-label="合并后显示名称"></label>
 <p v-if="plan.conflict" class="error" role="alert">{{plan.conflict}}。不会自动应用，请明确移除冲突的副前驱关系后再保存。</p><p v-else class="footnote">校验通过，可以保存并应用。</p>
 <div v-if="plan.config" class="merge-edge-list"><label v-for="e in plan.secondary" :key="edgeKey(e)" class="skill-check"><input type="checkbox" :checked="!drop.includes(edgeKey(e))" @change="drop=$event.target.checked?drop.filter(k=>k!==edgeKey(e)):[...drop,edgeKey(e)]">保留副前驱 {{name(e.from)}} → {{name(e.to)}}</label><p v-if="!plan.secondary.length" class="footnote">无副前驱冲突。</p><details><summary>合并后的主前驱关系（{{plan.config.nodes.filter(n=>n.parent).length}} 条）</summary><p v-for="n in plan.config.nodes.filter(n=>n.parent)" :key="n.id">{{name(n.parent)}} → {{name(n.id)}}</p></details></div></section>
 <ul v-if="Object.keys(base.aliases).length"><li v-for="(to,from) in base.aliases" :key="from">{{from}} → {{name(to)}} <button :disabled="mergeBlocked" @click="undoSource=from;preview=false">准备撤销此归并</button></li></ul><p v-else class="footnote">暂无个人归并。</p><p v-if="undoSource">待撤销别名：{{undoSource}}。点击模块右上角保存后生效。</p>
 <ModuleHelp><p class="footnote">两个节点须属于同一棵实线树。深节点并入浅节点，同深度时保留第二个节点。原始标签保留为别名，标签、图谱与专职引用一起保存。撤销已保存归并后，来源标签恢复为独立根。</p></ModuleHelp>
 </article>
 <article class="panel" :style="{order:cardPositions.topology}" aria-label="技能图谱客制化设置"><div class="panel-head module-head"><h2>技能图谱客制化</h2><div><button class="module-save" :class="{dirty:tDirty}" :disabled="!tDirty||!!conflict" @click="save('topology')">应用拓扑修改</button><button class="module-save" :class="{dirty:draftDirty}" :disabled="!draftDirty||!!draftConflict" @click="save('draft')">保存拓扑草稿</button><button :disabled="!draftDirty" @click="cancelTopology">撤销本次编辑</button><button v-if="storedDraft" @click="save('discardDraft')">放弃已存草稿</button></div></div>
 <p v-if="storedDraft" class="footnote">已恢复数据库中的拓扑草稿；分析页仍使用上次应用的图谱。</p><p v-if="conflict" class="error" role="alert">尚不能应用：{{conflict}}</p><p v-else class="footnote">{{tDraft.nodes.length}} 个节点，规则检查通过。右上角应用后才影响分析页。</p><TopologyEditor :key="editorKey" v-model="tDraft" :catalog="standard" />
 </article>
 </fieldset><p v-else-if="busy">正在读取设置…</p></section>`
};
