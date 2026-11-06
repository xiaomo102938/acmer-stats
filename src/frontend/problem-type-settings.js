import {onMounted,onUnmounted,reactive,ref} from 'vue';
import {apiFetch} from './api-fetch.js';
import {problemTypes} from './submission-display.js';

const options=Object.values(problemTypes).filter(type=>type.id!=='unknown');
const endpoint='/api/problem-types';
async function request(path='',method='GET',body){
 const response=await apiFetch(endpoint+path,{
  method,headers:method==='GET'?{}:{'Content-Type':'application/json','X-Acmer-Request':'1'},
  body:body===undefined?undefined:JSON.stringify(body)
 });
 const data=await response.json();
 if(!response.ok)throw new Error(data.message||'请求失败。');
 return data;
}

export default{
 setup(){
  const q=ref(''),unknown=ref(true),items=ref([]),page=ref(1),pages=ref(1),total=ref(0);
  const job=ref(null),error=ref(''),loading=ref(false),starting=ref(false),saving=ref('');
  const draft=reactive({});
  let poll,requestNumber=0,closed=false;
  async function load(target=1){
   const number=++requestNumber;
   loading.value=true;
   error.value='';
   try{
    const params=new URLSearchParams({q:q.value.trim(),unknown:unknown.value?'1':'',page:String(target)});
    const data=await request('?'+params);
    if(closed||number!==requestNumber)return;
    for(const key of Object.keys(draft))delete draft[key];
    for(const row of data.items)draft[row.problem_id]=row.manual_submission_type??(row.type==='unknown'?'':row.type);
    items.value=data.items;
    page.value=data.page;
    pages.value=data.pages;
    total.value=data.total;
   }catch(e){if(number===requestNumber)error.value=e.message;}
   finally{if(number===requestNumber)loading.value=false;}
  }
  async function refreshJob(){
   try{
    const previous=job.value?.status;
    job.value=await request('/auto');
    if(closed)return;
    if(job.value.status==='running')poll=setTimeout(refreshJob,2000);
    else if(previous==='running')void load(page.value);
   }catch(e){error.value=e.message;}
  }
  async function start(){
   starting.value=true;
   error.value='';
   clearTimeout(poll);
   try{
    job.value=await request('/auto','POST');
    await refreshJob();
   }catch(e){error.value=e.message;}
   finally{starting.value=false;}
  }
  async function save(row,type){
   saving.value=row.problem_id;
   error.value='';
   try{
    await request('/'+encodeURIComponent(row.problem_id),'PUT',{type});
    await load(page.value);
   }catch(e){error.value=e.message;}
   finally{saving.value='';}
  }
  onMounted(()=>{void load();void refreshJob();});
  onUnmounted(()=>{closed=true;clearTimeout(poll);});
  return {q,unknown,items,page,pages,total,job,error,loading,starting,saving,draft,options,problemTypes,load,start,save};
 },
 template:'<article class="panel">'+
  '<div class="panel-head"><h2>题型管理</h2><button :disabled="starting || job?.status===\'running\'" @click="start">一键自动判断问号题</button></div>'+
  '<p class="footnote">自动判断只检查未知题型。手动设定优先，也可以恢复自动结果。</p>'+
  '<p v-if="job?.status===\'running\' || job?.status===\'done\'" role="status">{{job.status===\'running\'?\'正在判断\':\'本轮结束\'}} · 已处理 {{job.done}} / {{job.total}} · 新归类 {{job.identified}} 道（传统题 {{job.standard ?? 0}} 道）<span v-if="job.skipped"> · 跳过 {{job.skipped}} 道</span><span v-if="job.errors"> · 读取失败 {{job.errors}} 次</span><span v-if="job.limited.length"> · {{job.limited.join(\'、\')}} 限流，余题留待下轮</span></p>'+
  '<p v-if="job?.status===\'error\'" role="alert">自动判断中断，请稍后重试。</p>'+
  '<form class="trend-controls submission-filters" @submit.prevent="load()"><label>搜索题目<input v-model="q" type="search" maxlength="100" placeholder="题名或题号"></label><button type="submit">搜索</button><label><input v-model="unknown" type="checkbox" @change="load()">只看问号题</label></form>'+
  '<p v-if="error" class="error" role="alert">{{error}}</p>'+
  '<div class="table-wrap" :aria-busy="loading"><table><thead><tr><th>题目</th><th>平台</th><th>当前题型</th><th>手动设定</th></tr></thead><tbody>'+
  '<tr v-for="row in items" :key="row.problem_id"><td>{{row.problem_name}}</td><td>{{row.platform_name}}</td><td>{{problemTypes[row.type]?.name ?? \'未知题型\'}}<span v-if="row.manual_submission_type">（手动）</span></td>'+
  '<td><form @submit.prevent="save(row,draft[row.problem_id])"><select v-model="draft[row.problem_id]" :aria-label="row.problem_name + \'的题型\'" :disabled="loading || !!saving"><option value="" disabled>选择题型</option><option v-for="option in options" :key="option.id" :value="option.id">{{option.name}}</option></select> <button :disabled="loading || !!saving || !draft[row.problem_id]">保存</button> <button v-if="row.manual_submission_type" type="button" :disabled="loading || !!saving" @click="save(row,null)">恢复自动结果</button></form></td></tr>'+
  '</tbody></table></div><p v-if="!loading && !items.length" class="footnote">没有符合条件的题目。</p>'+
  '<nav class="submission-pagination" aria-label="题型管理分页"><button :disabled="loading || page<=1" @click="load(page-1)">上一页</button><span>第 {{page}} / {{pages}} 页 · {{total}} 道题</span><button :disabled="loading || page>=pages" @click="load(page+1)">下一页</button></nav>'+
  '</article>'
};
