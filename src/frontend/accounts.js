import {syncSetup} from '../shared/account-config.js';
import {ref,onMounted,onBeforeUnmount,nextTick} from 'vue';
export default {
 emits:['synced'],
 setup(_props,{emit}){
  const formEl=ref(null);
  const accounts=ref([]),platforms=ref([]),form=ref({platform_id:'',login_name:'',remote_uid:'',cookie:'',remove_cookie:false}),
   editing=ref(null),message=ref(''),failure=ref(''),saving=ref(false),confirming=ref(null);
  let timer,loading=false,wasRunning=false;
  async function api(url,options={}){
   const response=await fetch('/api/accounts'+url,{...options,headers:{'Content-Type':'application/json','X-Acmer-Request':'1',...options.headers}});
   const body=await response.json();if(!response.ok) throw new Error(body.message||'请求失败');return body;
  }
  async function refresh(){
   if(loading)return;loading=true;
   try{
    const body=await api('');accounts.value=body.accounts;platforms.value=body.platforms;
    if(!form.value.platform_id&&body.platforms.length)form.value.platform_id=body.platforms[0].platform_id;
    const running=body.accounts.some(a=>a.sync_status==='running');
    if(wasRunning&&!running)emit('synced');
    wasRunning=running;
   }catch(error){failure.value=error.message;}finally{loading=false;}
  }
  async function save(){
   saving.value=true;message.value='';failure.value='';
   try{
    const body=await api(editing.value?'/'+editing.value:'',{method:editing.value?'PUT':'POST',body:JSON.stringify(form.value)});
    message.value=body.message;cancel();await refresh();
   }catch(error){failure.value=error.message;}finally{saving.value=false;}
  }
  function cancel(){editing.value=null;form.value={platform_id:platforms.value[0]?.platform_id||'',login_name:'',remote_uid:'',cookie:'',remove_cookie:false};}
  async function edit(account){
   editing.value=account.account_id;message.value='';failure.value='';
   form.value={platform_id:account.platform_id,login_name:account.login_name,remote_uid:account.remote_uid||'',cookie:'',remove_cookie:false};
   await nextTick();formEl.value?.scrollIntoView({behavior:'instant',block:'center'});
   formEl.value?.querySelector(account.platform_name==='牛客'&&!account.remote_uid?'[name=remote_uid]':'[name=cookie]')?.focus();
  }
  async function sync(account){
   if(!syncSetup(account).ready){message.value=syncSetup(account).reason;await edit(account);message.value=syncSetup(account).reason;return;}
   failure.value='';message.value='';
   try{const body=await api('/'+account.account_id+'/sync',{method:'POST',body:'{}'});message.value=body.message;wasRunning=true;await refresh();}
   catch(error){failure.value=error.message;}
  }
  async function remove(account){
   failure.value='';
   try{const body=await api('/'+account.account_id,{method:'DELETE'});message.value=body.message;confirming.value=null;if(editing.value===account.account_id)cancel();await refresh();}
   catch(error){failure.value=error.message;}
  }
  const selected=()=>platforms.value.find(p=>p.platform_id===form.value.platform_id);
  onMounted(()=>{refresh();timer=setInterval(refresh,2000);});
  onBeforeUnmount(()=>clearInterval(timer));
  return {formEl,syncSetup,accounts,platforms,form,editing,message,failure,saving,confirming,save,cancel,edit,sync,remove,selected};
 },
 template:`
 <section class="panel accounts-panel" id="accounts">
  <div class="panel-head"><h2>平台账号与同步</h2><span>同一平台可添加多个账号</span></div>
  <p class="account-description">绑定个人主页中的用户名，再点击同步。公开接口不需要密码；需要会话的平台可填写 Cookie。原有手工记录保留，重复同步按提交编号去重。</p>
  <div v-if="failure" class="error" role="alert">{{failure}}</div>
  <p v-if="message" class="account-message" role="status">{{message}}</p>
  <form ref="formEl" @submit.prevent="save" class="account-form">
   <label>平台<select v-model="form.platform_id" :disabled="!!editing" required><option v-for="p in platforms" :key="p.platform_id" :value="p.platform_id">{{p.platform_name}} · {{p.mode}}</option></select></label>
   <label>{{selected()?.platform_name==='洛谷'?'数字 UID':'用户名 / 用户标识'}}<input v-model.trim="form.login_name" :readonly="!!editing" maxlength="100" required placeholder="例如 xiaomo102938" autocomplete="off"></label>
   <label v-if="selected()?.platform_name==='牛客'">牛客主页链接 / 数字 UID<input name="remote_uid" v-model.trim="form.remote_uid" placeholder="https://ac.nowcoder.com/acm/contest/profile/数字UID"></label>
   <label v-if="['QOJ','牛客','LeetCode','洛谷'].includes(selected()?.platform_name)" class="cookie-field">{{selected()?.platform_name==='QOJ'?'QOJ 登录 Cookie':'登录 Cookie（可选）'}}<input name="cookie" v-model="form.cookie" type="password" autocomplete="new-password" maxlength="12000" placeholder="name=value; name2=value2"></label>
   <label v-if="editing" class="check-label"><input type="checkbox" v-model="form.remove_cookie">清除已保存的 Cookie</label>
   <div class="form-actions"><button class="primary" :disabled="saving">{{saving?'保存中…':editing?'保存设置':'添加账号'}}</button><button v-if="editing" type="button" @click="cancel">取消编辑</button></div>
  </form>
  <p class="footnote">{{selected()?.note}} Cookie 在本机服务端加密保存；编辑时留空保留已有值，过期后需要更新。</p>
  <details v-if="['QOJ','牛客'].includes(selected()?.platform_name)" class="footnote cookie-guide"><summary>如何配置 {{selected()?.platform_name}} 同步</summary>
   <p v-if="selected()?.platform_name==='牛客'">先打开牛客个人主页，将完整链接或其中的数字 UID 填入上方。保存后先尝试公开同步，仅在提示要求登录时填写 Cookie。</p>
   <ol><li>在你自己的浏览器中打开 {{selected()?.platform_name==='QOJ'?'qoj.ac':'ac.nowcoder.com'}} 并正常登录。</li><li>按 F12 打开开发者工具，选择“网络 / Network”，然后刷新平台页面。</li><li>选中该平台主页面请求，在“请求标头 / Request Headers”中找到 Cookie，复制完整的 name=value; name2=value2 内容。</li><li>只把 Cookie 值粘贴到本机设置页，点击“保存设置”，再点击“同步账号”。不要粘贴 Cookie: 前缀或 Set-Cookie 响应头。</li></ol>
   <p>保存一次即可重复使用，直到平台会话过期。Cookie 不需要发到聊天中；更新凭据不会删除已同步历史。QOJ 两个账号分别检查配置状态，依次同步。若提示 Cloudflare 浏览器验证，说明后台请求被防护拦截，不能直接判定 Cookie 失效；先在浏览器完成正常验证，仍失败时请保留错误信息。</p>
  </details>
  <p v-if="!accounts.length" class="muted">还没有绑定账号，请先添加。</p>
  <div class="account-list">
   <article class="account-card" v-for="a in accounts" :key="a.account_id">
    <div class="account-card-head"><div><b>{{a.platform_name}}</b><span class="account-login">{{a.login_name}}</span><span class="badge" :class="{good:a.sync_status==='success',weak:a.sync_status==='error'}">{{({idle:'未同步',running:'同步中',success:'已同步',error:'同步失败'})[a.sync_status]||a.sync_status}}</span></div>
     <div class="account-actions"><button @click="sync(a)" :disabled="a.sync_status==='running'||platforms.find(p=>p.platform_id===a.platform_id)?.mode==='暂未接入'">{{a.sync_status==='running'?'同步中…':syncSetup(a).action}}</button><button @click="edit(a)" :disabled="a.sync_status==='running'">编辑</button><button @click="confirming=a.account_id" :disabled="a.sync_status==='running'">解绑</button></div></div>
    <p v-if="!syncSetup(a).ready" class="footnote">{{syncSetup(a).reason}}</p>
    <p class="account-detail">最近成功同步：{{a.last_sync||'尚未同步'}}<span v-if="a.has_secret"> · 已保存加密 Cookie</span><span v-if="a.remote_uid"> · UID {{a.remote_uid}}</span></p>
    <p class="account-result" :class="{failed:a.sync_status==='error'}">{{a.sync_message||platforms.find(p=>p.platform_id===a.platform_id)?.note}}</p>
    <div v-if="confirming===a.account_id" class="unbind-confirm" role="alert">解绑后保留已同步的刷题记录。<button @click="remove(a)">确认解绑</button><button @click="confirming=null">取消</button></div>
   </article>
  </div>
  <p class="footnote">牛客和力扣的 AC 数据不包含完整失败提交，不能视作真实的全历史通过率。洛谷只提供可见练习清单与站点活动，不含逐次提交；同步记录的次数以实际获取到的提交为准，当前字段上限为 999。</p>
 </section>`
};
