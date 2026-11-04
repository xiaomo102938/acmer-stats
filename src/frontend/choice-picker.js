import {ref,computed,watch} from 'vue';
export function searchChoices(items,query){const words=String(query).normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);return items.filter(t=>{const text=(t.label+' '+(t.hint||'')+' '+(t.key??'')).normalize('NFKC').toLocaleLowerCase();return words.every(w=>text.includes(w));});}
export default{
 props:{modelValue:{default:null},items:{type:Array,default:()=>[]},label:{type:String,required:true},multiple:Boolean,disabled:Boolean,clearable:{type:Boolean,default:true}},emits:['update:modelValue','change'],
 setup(props,{emit}){
  const open=ref(false),query=ref(''),page=ref(1),size=8;
  const matches=computed(()=>searchChoices(props.items,query.value)),pages=computed(()=>Math.max(1,Math.ceil(matches.value.length/size))),visible=computed(()=>matches.value.slice((page.value-1)*size,page.value*size));
  const values=computed(()=>props.multiple?props.modelValue:(props.modelValue===undefined||props.modelValue===''?[]:[props.modelValue]));
  const name=key=>props.items.find(t=>t.key===key)?.label||String(key??'根节点（无前驱）');
  const selected=key=>values.value.includes(key);
  function update(v){emit('update:modelValue',v);emit('change',v);}
  function choose(key){if(props.multiple)update(selected(key)?values.value.filter(v=>v!==key):[...values.value,key]);else{update(key);open.value=false;}}
  function clear(key){if(props.multiple)update(values.value.filter(v=>v!==key));else update('');}
  watch(query,()=>page.value=1);watch(pages,n=>page.value=Math.min(page.value,n));
  return {open,query,page,pages,matches,visible,values,name,selected,choose,clear};
 },
 template:`<fieldset class="choice-picker" :disabled="disabled" :aria-label="label"><legend>{{label}}</legend>
 <div class="choice-summary"><span v-if="!values.length" class="muted">尚未选择</span><span v-for="key in values" :key="String(key)" class="choice-chip">{{name(key)}}<button v-if="multiple||clearable" type="button" @click="clear(key)" :aria-label="'移除'+label+'：'+name(key)">×</button></span><button type="button" class="choice-toggle" @click="open=!open" :aria-expanded="open" :aria-label="'搜索选择'+label">{{open?'收起选择':'搜索 / 分页选择'}}</button></div>
 <div v-if="open" class="choice-browser"><label>搜索 {{label}}<input v-model="query" type="search" :aria-label="'搜索'+label" placeholder="搜索中文、英文或标签键"></label>
 <div class="choice-results"><button v-for="t in visible" :key="String(t.key)" type="button" @click="choose(t.key)" :aria-pressed="selected(t.key)" :aria-label="(selected(t.key)?'已选':'选择')+label+'：'+t.label"><span>{{selected(t.key)?'✓ ':''}}{{t.label}}</span><small v-if="t.hint">{{t.hint}}</small></button></div><p v-if="!matches.length" class="footnote">没有匹配题型，试试其他关键词。</p>
 <nav class="choice-pagination" :aria-label="label+'选择分页'"><button type="button" :disabled="page<=1" @click="page--">上一页</button><span aria-live="polite">第 {{page}} / {{pages}} 页 · 共 {{matches.length}} 项</span><button type="button" :disabled="page>=pages" @click="page++">下一页</button></nav></div>
 </fieldset>`
};
