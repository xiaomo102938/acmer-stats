import {collectLeetcodeProgress} from './leetcode.js';
import {load} from 'cheerio';
import {qojTransport,qojFetch} from './qoj-network.js';
import {getDifficultyMetadata} from './difficulty-metadata.js';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const supportsHistoryRescan=platform=>platform==='Codeforces'||platform==='QOJ';
export const capabilities={
 Codeforces:{mode:'公开提交',note:'官方 API；每次最多读取最近 5000 条提交。'},
 AtCoder:{mode:'公开提交',note:'AtCoder Problems 第三方数据；每次最多 5000 条，后续同步从已保存进度继续。'},
 QOJ:{mode:'需要 Cookie',note:'同步可访问的已判定提交（含非 AC）；最多 100 页，受可见范围限制。'},
 LeetCode:{mode:'主页汇总与最近 AC',note:'填写个人主页 /u/ 后的标识（不是显示昵称）；累计题数取公开主页，逐次记录只提供最近 AC，不能还原全部历史。'},
 '牛客':{mode:'公开数据优先',note:'填写主页链接或数字 UID；先读取公开练习 AC，要求登录时才使用已保存 Cookie。最多 20 页，不包含全部比赛和失败提交。'},
 '洛谷':{mode:'公开练习与活动 · 可选 AC 明细',note:'填写数字 UID；同步通过、尝试题目及站点活动。保存登录 Cookie 后可同步带时间的 AC 记录。'}
};
export class SourceError extends Error {constructor(message,code='source_error'){super(message);this.code=code;}}
async function request(url,options={}) {
 const response=await (Object.hasOwn(options,'qojProxy')?qojFetch:fetch)(url,{...options,redirect:'manual',signal:AbortSignal.timeout(20000),
 headers:{'User-Agent':'acmer-stats/1.0 (personal coursework)','Accept':'application/json,text/html',...options.headers}});
 if(response.headers.get('cf-mitigated')==='challenge')throw new SourceError('平台的 Cloudflare 浏览器验证拦截了同步请求，尚未读取提交记录，不能据此判断 Cookie 是否有效。请先在浏览器正常完成验证；若后台仍被拦截，仅更新 Cookie 未必能解决。','browser_challenge');
 if(response.status>=300&&response.status<400) throw new SourceError('平台要求重新登录，请更新 Cookie。','auth_required');
 if(response.status===401||response.status===403)throw new SourceError('平台拒绝访问，可能需要登录；请检查会话或平台访问限制。','auth_required');
 if(response.status===429) throw new SourceError('平台请求过于频繁，请稍后重试。','rate_limited');
 if(!response.ok) throw new SourceError('平台返回 HTTP '+response.status+'，本次未写入记录。');
 return response;
}
function validItem(item) {
 if(!item.id||!item.key||!Number.isFinite(item.time)||item.time<0||item.time>Date.now()/1000+60) throw new SourceError('平台返回的提交数据格式异常，未导入。');
 return item;
}
export function normalizeCF(s) {
 if(!s.problem?.index||s.problem.contestId==null||s.verdict==null||s.verdict==='TESTING') return null;
 const p=s.problem, key=p.contestId+p.index;
 return validItem({id:String(s.id),key,title:'Codeforces '+key+' '+p.name,time:s.creationTimeSeconds,
 passed:s.verdict==='OK'?1:0,verdict:s.verdict==='OK'?'AC':s.verdict,tags:p.tags||[],native:p.rating==null?null:String(p.rating),
 url:'https://codeforces.com/problemset/problem/'+p.contestId+'/'+p.index});
}
export function normalizeAtCoder(s) {
 if(!s.problem_id||['WJ','WR','Judging'].includes(s.result)) return null;
 return validItem({id:String(s.id),key:s.problem_id,title:'AtCoder '+s.problem_id,time:s.epoch_second,
 passed:s.result==='AC'?1:0,verdict:s.result,tags:[],native:null,url:'https://atcoder.jp/contests/'+s.contest_id+'/tasks/'+s.problem_id});
}
export function parseAcceptedPage(html,platform,login,includeFailures=false) {
 const $=load(html);
 const body=$('body').clone();body.find('script,style,noscript').remove();
 if(/Just a moment|Checking your browser/i.test($('title').text())||$('#challenge-form,#challenge-running,#cf-challenge-running').length||
  (!$('table').length&&/captcha|安全验证|访问频繁|cf-chl-/i.test(body.text())))throw new SourceError('平台防护拦截了请求，请在平台完成正常登录后重试。');
 if($('input[type=password]').length||/must now be logged in/i.test(html)) throw new SourceError('平台要求登录或会话已失效，请更新 Cookie 后重试。','auth_required');
 const output=[];
 $('table tr').each((_i,row)=>{
  const cells=$(row).find('td'); if(!cells.length) return;
  const text=cells.text().replace(/\s+/g,' ');
  const links=$(row).find('a[href]').toArray();
  const problemLink=links.find(a=>platform==='QOJ'?/\/problem\/\d+/.test($(a).attr('href')):/\/(?:acm\/(?:problem\/\d+|contest\/\d+\/[^/?#]+)|practice\/[^/?#]+)/.test($(a).attr('href')));
  if(!problemLink) return;
  const accepted=cells.toArray().some(cell=>(platform==='QOJ'?/^(?:100(?:\.0+)?|Accepted|AC(?:\s*[✓✔])?)$/i:/^(?:100(?:\.0+)?|Accepted|AC|答案正确|通过)$/i).test($(cell).text().trim()));
  const scoreLink=$(row).find('a.uoj-score').first(),rawVerdict=(scoreLink.length?scoreLink.text():cells.eq(3).text()).trim();
  const failed=platform==='QOJ'&&/^(?:WA|TL|TLE|ML|MLE|RE|RTE|CE|OLE|OL|IL|PE|SE)(?:\s*[✗✘×])?$/.test(rawVerdict);
  const partial=platform==='QOJ'&&scoreLink.length&&scoreLink.attr('data-score')!=null&&Number.isFinite(Number(scoreLink.attr('data-score')))&&Number(scoreLink.attr('data-score'))<100;
  if(!accepted&&!(includeFailures&&(failed||partial))) return;
  const date=text.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  let submission=links.map(a=>$(a).attr('href')).find(h=>/\/(?:submission|status)\/\d+/.test(h)||/^#\d+$/.test(h));
  if(!submission&&platform==='牛客'&&/^\d+$/.test(cells.first().text().trim()))submission='/status/'+cells.first().text().trim();
  if(!date||!submission) throw new SourceError('提交页缺少提交编号或日期，已停止导入，避免生成不准确记录。');
  const href=$(problemLink).attr('href');
  const key=platform==='QOJ'?href.match(/\/problem\/(\d+)/)?.[1]:(href.match(/\/acm\/problem\/(\d+)/)?.[1]||href.match(/\/practice\/([^/?#]+)/)?.[1]||href.match(/\/acm\/contest\/(\d+\/[^/?#]+)/)?.[1]);
  output.push(validItem({id:submission.match(/(?:\/|#)(\d+)(?:\?|$|\/)/)[1],key,
   title:platform+' '+key+' '+$(problemLink).text().trim(),time:Date.parse(date[1]+'T'+date[2]+'+08:00')/1000,
   passed:accepted?1:0,verdict:accepted?'AC':failed?rawVerdict.replace(/[✗✘×]/g,'').trim():'PARTIAL',tags:[],native:null,url:new URL(href,platform==='QOJ'?'https://qoj.ac':'https://ac.nowcoder.com').href}));
 });
 if(!output.length&&!/no submissions|no records|没有提交|暂无记录|暂无数据/i.test(html)&&!(/<table/i.test(html)&&/submit time|submission|提交时间/i.test(html))) throw new SourceError('无法识别平台提交页面，本次没有导入。');
 return output;
}
export async function readNowcoderPage(url,secret='',useSession=false){
 async function read(cookie){
  const html=await(await request(url,{headers:{Referer:'https://ac.nowcoder.com/',...(cookie?{Cookie:cookie}:{})}})).text();
  return {html,rows:parseAcceptedPage(html,'牛客',''),usedCookie:!!cookie};
 }
 try{return await read(useSession?secret:'');}
 catch(error){
  if(!(error instanceof SourceError)||error.code!=='auth_required')throw error;
  if(!secret)throw new SourceError('牛客公开记录要求登录，请在编辑账号中填写 Cookie 后重试。','auth_required');
  if(useSession)throw new SourceError('牛客 Cookie 已失效或访问仍受限制，请重新登录并更新 Cookie。','auth_required');
  try{return await read(secret);}
  catch(authError){
   if(authError instanceof SourceError&&authError.code==='auth_required')throw new SourceError('牛客 Cookie 已失效或访问仍受限制，请重新登录并更新 Cookie。','auth_required');
   throw authError;
  }
 }
}
export async function collect(account,secret='',checkpointId=null) {
 const platform=account.platform_name, login=account.login_name, items=[];
 let checkpointSeen=false,stoppedAtCheckpoint=false;
 function reachedOverlap(rows){
  if(!checkpointId)return false;
  // Read the entire page after the checkpoint so recent delayed verdicts can be revisited.
  if(checkpointSeen){stoppedAtCheckpoint=true;return true;}
  checkpointSeen=rows.some(row=>row.id===checkpointId);
  return false;
 }
 let cursor=Math.max(0,Number(account.sync_cursor||0)-86400), note='', partial=false;
 if(platform==='Codeforces'){
  for(let page=0;page<10;page++){
   const url=new URL('https://codeforces.com/api/user.status');
   url.search=new URLSearchParams({handle:login,from:String(1+page*500),count:'500'});
   const body=await (await request(url)).json();
   if(body.status!=='OK') throw new SourceError('Codeforces 未能读取该账号，请检查用户名或稍后重试。');
   if(!Array.isArray(body.result)) throw new SourceError('Codeforces 数据格式异常。');
   const rows=body.result.map(normalizeCF).filter(Boolean);
   items.push(...rows);
   if(reachedOverlap(rows)||body.result.length<500) break;
   if(page===9) partial=true; else await pause(2200);
  }
  note=partial?'已读取最近 5000 条提交；更早历史暂未覆盖。':'已读取公开提交记录。';
 }else if(platform==='AtCoder'){
  for(let page=0;page<10;page++){
   const url=new URL('https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions');
   url.search=new URLSearchParams({user:login,from_second:String(cursor)});
   const rows=await (await request(url)).json();
   if(!Array.isArray(rows)) throw new SourceError('AtCoder Problems 数据格式异常。');
   items.push(...rows.map(normalizeAtCoder).filter(Boolean));
   const next=Math.max(cursor,...rows.map(s=>Number(s.epoch_second)));
   if(rows.length<500){cursor=next;break;}
   if(next===cursor) throw new SourceError('同一秒的提交超过分页容量，已停止同步以免遗漏。');
   cursor=next;
   if(page===9) partial=true; else await pause(1200);
  }
  note=partial?'本次已读取 5000 条；再次同步将继续剩余历史。':'已读取 AtCoder Problems 收录的提交记录（可能存在延迟）。';
 }else if(platform==='QOJ'||platform==='牛客'){
  if(platform==='QOJ'&&!secret) throw new SourceError('QOJ 需要登录 Cookie，请先编辑账号填写 Cookie。');
  if(platform==='牛客'&&!/^\d+$/.test(account.remote_uid||'')) throw new SourceError('牛客需要个人主页地址中的数字 UID，请先编辑账号填写。');
  let usedCookie=platform==='QOJ';
  const maxPages=platform==='QOJ'?100:20;
  let transport={};
  if(platform==='QOJ'){try{transport=await qojTransport();}catch{throw new SourceError('无法读取 QOJ 代理配置，请检查 QOJ_PROXY_URL 与 Windows 系统代理设置。');}}
  for(let page=1;page<=maxPages;page++){
   const url=platform==='QOJ'?new URL('https://qoj.ac/submissions'):new URL('https://ac.nowcoder.com/acm/contest/profile/'+account.remote_uid+'/practice-coding');
   url.search=new URLSearchParams(platform==='QOJ'?{submitter:login,page:String(page)}:{page:String(page),pageSize:'200',statusTypeFilter:'5',orderType:'DESC',languageCategoryFilter:'-1'});
   let html,rows;
   if(platform==='牛客'){
    const result=await readNowcoderPage(url,secret,usedCookie);({html,rows}=result);usedCookie=result.usedCookie;
   }else{
    html=await(await request(url,{...transport,headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',Accept:'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',Cookie:secret}})).text();
    rows=parseAcceptedPage(html,platform,login,true);
   }
   items.push(...rows);
   const next=new RegExp('(?:page|pageNo)='+String(page+1)+'(?:[^0-9]|$)').test(html);
   if((platform==='QOJ'&&reachedOverlap(rows))||!next) break;
   if(page===maxPages) partial=true; else await pause(1200);
  }
  note=(platform==='牛客'?(usedCookie?'本次使用已保存的 Cookie 读取。':'本次读取公开数据，未使用 Cookie。'):'本次使用已保存的 QOJ Cookie。')+(platform==='QOJ'?'已导入可见的已判定提交（含非 AC）；未获取或仍在评测的记录不推算。':'仅导入可见的 AC 提交，失败提交、完整提交次数和缺失历史无法推算。')+(partial?'本次达到 '+maxPages+' 页上限，更早记录暂未覆盖。':'');
 }else if(platform==='LeetCode'){
  const body=await (await request('https://leetcode.cn/graphql/noj-go/',{
   method:'POST',headers:{'Content-Type':'application/json',Referer:'https://leetcode.cn/',...(secret?{Cookie:secret}:{})},
   body:JSON.stringify({query:'query recentACSubmissions($userSlug: String!) { recentACSubmissions(userSlug: $userSlug) { submissionId submitTime question { title titleSlug translatedTitle } } }',variables:{userSlug:login}})
  })).json();
  const rows=body.data?.recentACSubmissions;
  if(body.errors?.length||!Array.isArray(rows)) throw new SourceError('力扣未返回可用记录，请检查个人主页中的用户标识或访问权限。');
  for(const s of rows) items.push(validItem({id:String(s.submissionId),key:s.question.titleSlug,
   title:'LeetCode '+(s.question.translatedTitle||s.question.title),time:Number(s.submitTime),
   passed:1,tags:[],native:null,url:'https://leetcode.cn/problems/'+s.question.titleSlug+'/'}));
  note=rows.length?'仅同步力扣中国公开的最近 AC 列表；不代表全部历史，失败提交未包含。':'该用户标识未返回公开 AC 记录。请核对力扣个人主页 /u/ 后的标识；此结果不能证明账号不存在或从未刷题。';
 }else throw new SourceError('该平台暂未接入同步，可以先保存账号。');
 let metadata,profileTotals;
 if(platform==='LeetCode'){
  try{profileTotals=await collectLeetcodeProgress(login);note+=' 已获取个人主页累计通过 '+profileTotals.passed+' 题、累计尝试 '+profileTotals.attempted+' 题；历史日期及题单缺失部分不推算。';}
  catch{note+=' 主页累计题数暂不可用，已有汇总保留。';}
 }
 if(['Codeforces','AtCoder'].includes(platform)){
  try{
   metadata=await getDifficultyMetadata(platform);
   for(const item of items){const meta=metadata.get(item.key);if(meta?.native!=null){item.native=meta.native;item.nativeSource=meta.source;}}
  }catch{note+=' 难度数据源暂不可用，已有难度保留，稍后同步可重试。';}
 }
 if(stoppedAtCheckpoint)note+=' 已读到上次同步位置并额外复查一页。';
 return {items:[...new Map(items.map(s=>[s.id,s])).values()],cursor,note,partial,metadata,profileTotals};
}
