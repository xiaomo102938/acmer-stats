import express from 'express';
import {randomUUID,createHash} from 'node:crypto';
import {capabilities,collect,SourceError} from './adapters.js';
import {encrypt,decrypt} from './secrets.js';
import {saveSubmissions} from './sync-store.js';

export function accountRouter(pool) {
 const router=express.Router(), busy=new Set();
 const invalid=message=>Object.assign(new Error(message),{status:400});
 async function owner(){
  const [[user]]=await pool.query('SELECT user_id FROM user ORDER BY user_id LIMIT 1');
  if(!user) throw invalid('请先建立个人用户信息。');
  return user.user_id;
 }
 router.get('/',async(_req,res)=>{
  const user=await owner();
  const [platforms]=await pool.query('SELECT platform_id,platform_name FROM platform ORDER BY platform_name');
  const [accounts]=await pool.execute(`SELECT a.account_id,a.login_name,a.remote_uid,a.platform_id,
   a.last_sync,a.last_attempt,a.sync_status,a.sync_message,(a.login_pwd IS NOT NULL) AS has_secret,p.platform_name
   FROM platform_account a JOIN platform p ON p.platform_id=a.platform_id WHERE a.user_id=? ORDER BY p.platform_name,a.login_name`,[user]);
  res.set('Cache-Control','no-store').json({platforms:platforms.map(p=>({...p,...capabilities[p.platform_name]})),accounts});
 });
 function input(body) {
  const login=String(body.login_name||'').trim(),cookie=String(body.cookie||'').trim(),uid=String(body.remote_uid||'').trim();
  if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(login)) throw invalid('账号需为 1～100 位字母、数字、下划线、点或短横线，请填写个人主页的用户标识。');
  if(cookie.length>12000||/[\r\n\0]/.test(cookie)) throw invalid('Cookie 格式不正确或过长。');
  if(cookie&&!/^[^=;\s]+=[^;]*(?:;\s*[^=;\s]+=[^;]*)*;?$/.test(cookie)) throw invalid('请填写完整的 name=value 格式 Cookie。');
  if(uid&&!/^\d{1,30}$/.test(uid)) throw invalid('牛客 UID 需为数字。');
  return {login,cookie,uid};
 }
 router.post('/',async(req,res)=>{
  const {login,cookie,uid}=input(req.body), user=await owner();
  const [[platform]]=await pool.execute('SELECT platform_name FROM platform WHERE platform_id=?',[String(req.body.platform_id||'')]);
  if(!platform) throw invalid('请选择有效的平台。');
  const id=randomUUID();
  try {await pool.execute('INSERT INTO platform_account(account_id,user_id,platform_id,login_name,login_pwd,remote_uid) VALUES(?,?,?,?,?,?)',[id,user,req.body.platform_id,login,encrypt(cookie),uid||null]);}
  catch(e){if(e.code==='ER_DUP_ENTRY') throw Object.assign(new Error('该账号已经绑定。'),{status:409});throw e;}
  res.status(201).json({account_id:id,message:'账号已保存。'});
 });
 router.put('/:id',async(req,res)=>{
  const {login,cookie,uid}=input(req.body),user=await owner();
  if(busy.has(req.params.id)) throw Object.assign(new Error('账号正在同步，请稍后编辑。'),{status:409});
  const [[account]]=await pool.execute('SELECT login_name FROM platform_account WHERE account_id=? AND user_id=?',[req.params.id,user]);
  if(!account) return res.status(404).json({message:'账号不存在。'});
  if(login!==account.login_name) throw invalid('如需更换用户名，请先解绑再添加新账号；已同步记录会保留。');
  await pool.execute('UPDATE platform_account SET remote_uid=?,login_pwd=CASE WHEN ? THEN NULL WHEN ? IS NOT NULL THEN ? ELSE login_pwd END WHERE account_id=? AND user_id=?',
   [uid||null,req.body.remove_cookie===true, cookie?1:null,encrypt(cookie),req.params.id,user]);
  res.json({message:'账号设置已更新。'});
 });
 router.delete('/:id',async(req,res)=>{
  if(busy.has(req.params.id)) throw Object.assign(new Error('账号正在同步，请稍后解绑。'),{status:409});
  const [result]=await pool.execute('DELETE FROM platform_account WHERE account_id=? AND user_id=?',[req.params.id,await owner()]);
  res.status(result.affectedRows?200:404).json({message:result.affectedRows?'已解绑，历史刷题记录保留。':'账号不存在。'});
 });
 router.post('/:id/sync',async(req,res)=>{
  const [[account]]=await pool.execute('SELECT a.*,p.platform_name FROM platform_account a JOIN platform p ON p.platform_id=a.platform_id WHERE a.account_id=? AND a.user_id=?',[req.params.id,await owner()]);
  if(!account) return res.status(404).json({message:'账号不存在。'});
  if(busy.has(account.account_id)) return res.status(409).json({message:'该账号正在同步。'});
  if(!capabilities[account.platform_name]||capabilities[account.platform_name].mode==='暂未接入') throw invalid('该平台暂未接入同步。');
  if(account.platform_name==='QOJ'&&!account.login_pwd) throw invalid('请先编辑账号填写 QOJ 登录 Cookie。');
  if(account.platform_name==='牛客'&&!account.remote_uid) throw invalid('请先编辑账号填写个人主页中的数字 UID。');
  busy.add(account.account_id);
  await pool.execute("UPDATE platform_account SET sync_status='running',sync_message='正在读取平台记录…',last_attempt=NOW() WHERE account_id=?",[account.account_id]);
  res.status(202).json({message:'同步已开始，请留意账号状态。'});
  void (async()=>{
   let connection,locked=false;
   const lockName='acmer-sync-'+createHash('sha256').update(account.user_id+account.platform_id).digest('hex').slice(0,48);
   try {
    connection=await pool.getConnection();
    const [[lock]]=await connection.execute('SELECT GET_LOCK(?,0) AS acquired',[lockName]);
    if(lock.acquired!==1) throw new SourceError('同平台的另一个账号正在同步，请稍后重试。');
    locked=true;
    const result=await collect(account,decrypt(account.login_pwd));
    await saveSubmissions(connection,account,result);
   }catch(error){
    const message=error instanceof SourceError?error.message:'同步未完成，已有数据未被清空。请检查网络或稍后重试。';
    await pool.execute("UPDATE platform_account SET sync_status='error',sync_message=? WHERE account_id=?",[message,account.account_id]).catch(()=>{});
    console.error('Sync failed:',account.platform_name,error.code||error.name);
   }finally{
    if(locked) await connection.execute('SELECT RELEASE_LOCK(?)',[lockName]).catch(()=>{});
    connection?.release();busy.delete(account.account_id);
   }
  })();
 });
 return router;
}
