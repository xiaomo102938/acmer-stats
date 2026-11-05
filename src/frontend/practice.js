import {ref,onMounted,onBeforeUnmount,watch} from 'vue';
import {submissionLabel,problemLink} from './submission-display.js';

export default{
 props:{initialTag:{type:String,default:''},refreshKey:Number},
 setup(props){
  const mode=ref(props.initialTag?'recommend':'retry'),tag=ref(props.initialTag),options=ref([]);
  const manual=ref(''),appliedTarget=ref(''),hasSpecialties=ref(false);
  const result=ref(null),loading=ref(false),error=ref('');
  let request;
  async function load(page=1){
   request?.abort();
   const current=new AbortController();
   request=current;loading.value=true;error.value='';result.value=null;
   const params=new URLSearchParams({mode:mode.value,tag:tag.value,page:String(page)});
   if(mode.value==='recommend'&&appliedTarget.value!=='')params.set('target',String(appliedTarget.value));
   try{
    const response=await fetch('/api/practice?'+params,{signal:current.signal});
    const body=await response.json();
    if(!response.ok)throw new Error(body.message);
    if(current.signal.aborted)return;
    result.value=body;options.value=body.options;tag.value=body.selected||'';
    hasSpecialties.value=body.hasSpecialties??hasSpecialties.value;
   }catch(e){if(!current.signal.aborted)error.value=e.message||'题单加载失败。';}
   finally{if(request===current)loading.value=false;}
  }
  function selectMode(next){
   if(next===mode.value)return;
   mode.value=next;tag.value='';manual.value='';appliedTarget.value='';load();
  }
  function selectTag(){manual.value='';appliedTarget.value='';load();}
  function applyTarget(){appliedTarget.value=manual.value;load();}
  watch(()=>props.refreshKey,()=>load());
  onMounted(()=>load());
  onBeforeUnmount(()=>request?.abort());
  return {mode,tag,options,manual,appliedTarget,hasSpecialties,result,loading,error,load,selectMode,selectTag,applyTarget,submissionLabel,problemLink};
 },
 template:`
 <article class="panel practice-panel" aria-label="练习题单">
  <div class="panel-head"><h2>练习题单</h2>
   <div class="practice-tabs" role="group" aria-label="题单类型">
    <button type="button" :aria-pressed="mode==='retry'" @click="selectMode('retry')">待攻克</button>
    <button type="button" :aria-pressed="mode==='recommend'" @click="selectMode('recommend')">按能力推荐</button>
   </div>
  </div>
  <form class="trend-controls practice-filters" @submit.prevent="applyTarget">
   <label>题型<select v-model="tag" @change="selectTag" :disabled="!options.length">
    <option v-if="mode==='retry'" value="">全部题型</option>
    <option v-if="mode==='retry'&&hasSpecialties" value="@specialty">我的专职题型</option>
    <option v-if="mode==='recommend'&&!tag" value="" disabled>选择题型</option>
    <option v-for="option in options" :key="option.key" :value="option.key">{{option.name}}</option>
   </select></label>
   <template v-if="mode==='recommend'">
    <label>目标难度（可选）<input v-model.number="manual" type="number" min="800" max="4000" step="1" placeholder="默认按题型能力"></label>
    <button :disabled="!options.length||loading">应用难度</button>
   </template>
  </form>
  <p v-if="mode==='retry'" class="footnote">根据已同步的提交整理，同题只保留最近一次判定。同步到 AC 后自动移出；只提供 AC 或练习清单的平台覆盖有限。</p>
  <p v-else-if="result" class="footnote">
   <template v-if="result.ability!==null">题型参考 {{result.ability}} 分 · {{result.sampleCount}} / 25 道计分题{{result.sampleCount<25?'（暂定）':''}}。</template>
   <template v-if="result.target!==null">推荐目标 {{result.target}} 分，范围 ±{{result.radius}} 分，排除本地已有记录的题目。</template>
   <template v-else>该题型暂无可计分样本，可以手动填写目标难度。</template>
  </p>
  <p v-if="loading" role="status" class="muted">正在读取题单…</p>
  <p v-else-if="error||result?.sourceError" class="error" role="alert">{{error||result.sourceError}} <button @click="load()">重试</button></p>
  <template v-else-if="result">
   <div v-if="result.items.length" class="table-wrap">
    <table><thead><tr><th>题目</th><th>平台</th><th>{{mode==='retry'?'最近判定':'CF 题目难度'}}</th><th>{{mode==='retry'?'最近提交时间（UTC+8）':'推荐理由'}}</th></tr></thead>
     <tbody><tr v-for="row in result.items" :key="row.problem_id">
      <td class="submission-problem"><a v-if="problemLink(row)" :href="problemLink(row)" class="problem" target="_blank" rel="noopener noreferrer">{{row.problem_name}} ↗</a><span v-else>{{row.problem_name}}</span></td>
      <td>{{mode==='retry'?row.platform_name:'Codeforces'}}</td>
      <td v-if="mode==='retry'"><span class="badge weak">{{submissionLabel(row)}}</span></td><td v-else>{{row.rating}}</td>
      <td>{{mode==='retry'?row.submitted_at:row.distance?'距目标 '+Math.round(row.distance*10)/10+' 分':'与目标难度相同'}}</td>
     </tr></tbody>
    </table>
   </div>
   <p v-else class="muted">{{mode==='retry'?'当前筛选下没有待攻克的题目。':result.target===null?'填写目标难度后可查看题单。':'该题型在当前难度范围内暂无匹配的新题。'}}</p>
   <nav v-if="result.total" class="submission-pagination" aria-label="练习题单分页">
    <button :disabled="result.page<=1" @click="load(result.page-1)">上一页</button>
    <span aria-live="polite">第 {{result.page}} / {{result.pages}} 页 · 共 {{result.total}} 道</span>
    <button :disabled="result.page>=result.pages" @click="load(result.page+1)">下一页</button>
   </nav>
  </template>
 </article>`
};
