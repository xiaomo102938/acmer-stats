export function nowcoderUid(value){
 const text=String(value??'').trim();
 if(/^\d{1,30}$/.test(text))return text;
 try{
  const url=new URL(text);
  if(!['https:','http:'].includes(url.protocol)||!['www.nowcoder.com','ac.nowcoder.com','nowcoder.com'].includes(url.hostname))return null;
  return url.pathname.match(/^\/(?:acm\/contest\/profile|profile|users)\/(\d{1,30})(?:\/|$)/)?.[1]||null;
 }catch{return null;}
}
export function syncSetup(account){
 if(account.platform_name==='QOJ'&&!account.has_secret)return {ready:false,action:'配置 Cookie',reason:'QOJ 提交列表需要登录 Cookie。'};
 if(account.platform_name==='牛客'&&!nowcoderUid(account.remote_uid))return {ready:false,action:'填写 UID',reason:'先填写牛客主页链接或数字 UID；公开同步不要求 Cookie。'};
 return {ready:true,action:'同步账号',reason:''};
}
