import {ref,computed,onMounted} from 'vue';
import SkillGraph from './skill-graph.js';
import {defaultSkills,validateSkills,mergeDraft,specialtyKeys} from '../shared/skill-settings.js';
export default{
 components:{SkillGraph},emits:['saved'],
 setup(_props,{emit}){
  const draft=ref(null),catalog=ref([]),revision=ref(0),saved=ref(''),error=ref(''),busy=ref(false),selected=ref('dp'),source=ref(''),target=ref(''),add=ref(''),preview=ref(false),query=ref('');const baseline=ref('');
  const dirty=computed(()=>draft.value&&JSON.stringify(draft.value)!==baseline.value);
  const standard=computed(()=>catalog.value.filter(t=>!draft.value?.aliases[t.key]));
  const name=id=>draft.value?.names[id]||catalog.value.find(t=>t.key===id)?.name||id;
  const current=computed(()=>draft.value?.nodes.find(n=>n.id===selected.value));
  const candidates=computed(()=>standard.value.filter(t=>!draft.value.nodes.some(n=>n.id===t.key)));
  const filtered=computed(()=>draft.value?.nodes.filter(n=>name(n.id).toLowerCase().includes(query.value.toLowerCase()))||[]);
  const validation=computed(()=>{if(!draft.value)return '';try{validateSkills(draft.value,catalog.value);return '';}catch(e){return e.message;}});
  const coverage=computed(()=>draft.value?specialtyKeys(draft.value).size:0);
  async function load(){busy.value=true;error.value='';try{const r=await fetch('/api/skill-settings');const b=await r.json();if(!r.ok)throw Error(b.message);draft.value=b.config;catalog.value=b.catalog;revision.value=b.revision;baseline.value=JSON.stringify(b.config);selected.value=b.config.nodes[0]?.id||'';preview.value=false;}catch(e){error.value=e.message;}finally{busy.value=false;}}
  async function save(){if(validation.value){error.value=validation.value;return;}busy.value=true;error.value='';saved.value='';try{const r=await fetch('/api/skill-settings',{method:'PUT',headers:{'Content-Type':'application/json','X-Acmer-Request':'1'},body:JSON.stringify({config:draft.value,revision:revision.value})});const b=await r.json();if(!r.ok)throw Error(b.message);revision.value=b.revision;baseline.value=JSON.stringify(draft.value);saved.value=b.message;emit('saved');}catch(e){error.value=e.message;}finally{busy.value=false;}}
  function merge(){error.value='';try{draft.value=mergeDraft(JSON.parse(JSON.stringify(draft.value)),source.value,target.value);selected.value=target.value;source.value='';target.value='';preview.value=false;}catch(e){error.value=e.message;}}
  function undo(id){delete draft.value.aliases[id];if(!draft.value.nodes.some(n=>n.id===id))draft.value.nodes.push({id,parent:null,secondary:[]});}
  function remove(){const id=current.value.id;if(draft.value.nodes.some(n=>n.parent===id||n.secondary.includes(id))){error.value='请先为下级更换主前驱，并移除指向该节点的副前驱引用。';return;}draft.value.nodes=draft.value.nodes.filter(n=>n.id!==id);selected.value=draft.value.nodes[0]?.id||'';preview.value=false;}
  function addNode(){if(!add.value)return;draft.value.nodes.push({id:add.value,parent:null,secondary:[]});selected.value=add.value;add.value='';}
  function rootChanged(){if(current.value?.parent===null)current.value.secondary=[];preview.value=false;}
  function reset(){draft.value=defaultSkills();for(const t of catalog.value)draft.value.names[t.key]=t.name;selected.value='dp';preview.value=false;saved.value='已恢复默认草稿，点击保存后生效；取消编辑可恢复上次保存。';}
  onMounted(load);
  return {draft,catalog,revision,saved,error,busy,selected,source,target,add,preview,query,dirty,standard,name,current,candidates,filtered,validation,coverage,load,save,merge,undo,remove,addNode,rootChanged,reset};
 },
 template:`<article class="panel skill-settings" aria-label="题型与技能图谱设置"><div class="panel-head"><h2>题型与技能图谱</h2><span>{{dirty?'有未保存的修改':'已保存配置'}}</span></div>
 <p v-if="error" class="error" role="alert">{{error}}</p><p v-if="saved" role="status">{{saved}}</p>
 <fieldset v-if="draft" :disabled="busy" class="skill-fields">
 <h3>专职题型</h3><p class="footnote">可多选。默认综合能力只从专职范围内选最高 150 道已通过且有评分依据的题目，同题和可识别的同源题只算一次。未配置时会提示设置。</p>
 <label>选择专职题型（Ctrl / Command 可多选）<select multiple size="7" v-model="draft.specialties" aria-label="专职题型"><option v-for="t in standard" :key="t.key" :value="t.key">{{name(t.key)}}</option></select></label>
 <label class="skill-check"><input type="checkbox" v-model="draft.includeDescendants">包含专职题型的实线下级分支（不沿虚线扩展）</label><p class="footnote">当前选中 {{draft.specialties.length}} 个专职题型，包含分支后覆盖 {{coverage}} 个题型。</p>
 <hr><h3>标签类型归并</h3><p class="footnote">只归并已有标签，原始平台标签和题目数据保留。后续同步自动沿用规则；同一题带多个别名不重复计数。归并不是建立父子关系。</p>
 <div class="skill-edit-row"><label>待归并标签<select v-model="source" aria-label="待归并标签"><option value="">请选择</option><option v-for="t in standard" :value="t.key">{{name(t.key)}} · {{t.key}}</option></select></label><label>归入标准题型<select v-model="target" aria-label="归入标准题型"><option value="">请选择</option><option v-for="t in standard.filter(t=>t.key!==source)" :value="t.key">{{name(t.key)}} · {{t.key}}</option></select></label><button :disabled="!source||!target" @click="merge">加入归并草稿</button></div>
 <label v-if="target">标准题型显示名称<input v-model="draft.names[target]" maxlength="100" aria-label="标准题型显示名称"></label>
 <ul v-if="Object.keys(draft.aliases).length"><li v-for="(to,from) in draft.aliases" :key="from">{{from}} → {{name(to)}} <button @click="undo(from)">撤销此归并</button></li></ul><p v-else class="footnote">暂无个人归并规则；系统自带的中英文标准化继续生效。</p>
 <hr><h3>技能图谱客制化拓扑关系</h3><p class="footnote">根节点没有前驱；非根节点恰有一个主前驱（实线），可有多个副前驱（虚线）。禁止自环、重复连边及任何实虚混合环。未纳入图谱的题型仍可选为专职。</p>
 <div class="skill-edit-row"><label>添加独立根节点<select v-model="add" aria-label="添加图谱题型"><option value="">请选择题型</option><option v-for="t in candidates" :value="t.key">{{name(t.key)}}</option></select></label><button :disabled="!add" @click="addNode">添加节点</button></div>
 <label>筛选图谱节点<input v-model="query" aria-label="筛选图谱节点" placeholder="输入题型名称"></label>
 <label>编辑节点<select v-model="selected" aria-label="编辑图谱节点"><option v-for="n in filtered" :value="n.id">{{name(n.id)}}{{n.parent===null?'（根）':''}}</option></select></label>
 <div v-if="current" class="skill-node-editor"><label>显示名称<input v-model="draft.names[current.id]" :placeholder="name(current.id)" maxlength="100" aria-label="题型显示名称"></label><label>主前驱<select v-model="current.parent" @change="rootChanged" aria-label="主前驱"><option :value="null">根节点（无前驱）</option><option v-for="n in draft.nodes.filter(n=>n.id!==current.id)" :value="n.id">{{name(n.id)}}</option></select></label><label>副前驱（Ctrl / Command 可多选）<select multiple size="6" v-model="current.secondary" :disabled="current.parent===null" aria-label="副前驱"><option v-for="n in draft.nodes.filter(n=>n.id!==current.id&&n.id!==current.parent)" :value="n.id">{{name(n.id)}}</option></select></label><button @click="remove">从图谱移除此节点</button></div>
 <p v-if="validation" class="error" role="alert">{{validation}}</p><p v-else class="footnote">检查通过：{{draft.nodes.length}} 个节点，拓扑无环。预览和保存使用相同校验，服务端再次校验。</p>
 <div class="skill-actions"><button :disabled="busy||!!validation||!dirty" @click="save">{{busy?'正在保存…':'保存题型与图谱设置'}}</button><button :disabled="busy||!dirty" @click="load">取消编辑 / 重新加载</button><button @click="reset">恢复默认草稿</button><button :disabled="!!validation" @click="preview=!preview">{{preview?'收起预览':'预览拓扑草稿'}}</button></div>
 <SkillGraph v-if="preview&&!validation" :config="draft" :profiles="[]" /><p v-if="preview" class="footnote">此处预览关系与显示名称，题数统一为 0；分析页使用真实统计。</p>
 </fieldset><p v-else>正在读取设置…</p></article>`
};
