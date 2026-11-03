import {load} from 'cheerio';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const capabilities={
 Codeforces:{mode:'公开提交',note:'官方 API；每次最多读取最近 5000 条提交。'},
 AtCoder:{mode:'公开提交',note:'AtCoder Problems 第三方数据；每次最多 5000 条，后续同步从已保存进度继续。'},
 QOJ:{mode:'需要 Cookie',note:'同步可访问的 AC 提交；最多 20 页。通过记录不代表完整提交历史。'},
 LeetCode:{mode:'最近 AC',note:'力扣中国公开的最近 AC 列表，不能还原全部历史或失败提交。'},
 '牛客':{mode:'需要数字 UID',note:'同步个人练习页的 AC 记录，最多 20 页；不包含全部比赛和失败提交。'},
 '洛谷':{mode:'暂未接入',note:'可以保存账号，当前不执行自动抓取。'}
};
export class SourceError extends Error {}
async function request(url,options={}) {
 const response=await fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(20000),
 headers:{'User-Agent':'acmer-stats/1.0 (personal coursework)','Accept':'application/json,text/html',...options.headers}});
 if(response.status>=300&&response.status<400) throw new SourceError('平台要求重新登录，请更新 Cookie。');
 if(response.status===403||response.status===429) throw new SourceError('平台访问受限或请求过于频繁，请稍后重试；需要会话的平台请更新 Cookie。');
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
 passed:s.verdict==='OK'?1:0,tags:p.tags||[],native:p.rating==null?null:String(p.rating),
 url:'https://codeforces.com/problemset/problem/'+p.contestId+'/'+p.index});
}
export function normalizeAtCoder(s) {
 if(!s.problem_id||['WJ','WR','Judging'].includes(s.result)) return null;
 return validItem({id:String(s.id),key:s.problem_id,title:'AtCoder '+s.problem_id,time:s.epoch_second,
 passed:s.result==='AC'?1:0,tags:[],native:null,url:'https://atcoder.jp/contests/'+s.contest_id+'/tasks/'+s.problem_id});
}
export function parseAcceptedPage(html,platform,login) {
 if(/Just a moment|cf-chl-|captcha|安全验证|访问频繁/i.test(html)) throw new SourceError('平台防护拦截了请求，请在平台完成正常登录后重试。');
 const $=load(html);
 if($('input[type=password]').length||/must now be logged in/i.test(html)) throw new SourceError('登录会话失效，请重新填写 Cookie。');
 const output=[];
 $('table tr').each((_i,row)=>{
  const cells=$(row).find('td'); if(!cells.length) return;
  const text=cells.text().replace(/\s+/g,' ');
  const links=$(row).find('a[href]').toArray();
  const problemLink=links.find(a=>platform==='QOJ'?/\/problem\/\d+/.test($(a).attr('href')):/\/(?:acm\/(?:problem\/\d+|contest\/\d+\/[^/?#]+)|practice\/[^/?#]+)/.test($(a).attr('href')));
  if(!problemLink) return;
  const accepted=cells.toArray().some(cell=>/^(?:100(?:\.0+)?|Accepted|AC|答案正确|通过)$/i.test($(cell).text().trim()));
  if(!accepted) return;
  const date=text.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  let submission=links.map(a=>$(a).attr('href')).find(h=>/\/(?:submission|status)\/\d+/.test(h)||/^#\d+$/.test(h));
  if(!submission&&platform==='牛客'&&/^\d+$/.test(cells.first().text().trim()))submission='/status/'+cells.first().text().trim();
  if(!date||!submission) throw new SourceError('提交页缺少提交编号或日期，已停止导入，避免生成不准确记录。');
  const href=$(problemLink).attr('href');
  const key=platform==='QOJ'?href.match(/\/problem\/(\d+)/)?.[1]:(href.match(/\/acm\/problem\/(\d+)/)?.[1]||href.match(/\/practice\/([^/?#]+)/)?.[1]||href.match(/\/acm\/contest\/(\d+\/[^/?#]+)/)?.[1]);
  output.push(validItem({id:submission.match(/(?:\/|#)(\d+)(?:\?|$|\/)/)[1],key,
   title:platform+' '+key+' '+$(problemLink).text().trim(),time:Date.parse(date[1]+'T'+date[2]+'+08:00')/1000,
   passed:1,tags:[],native:null,url:new URL(href,platform==='QOJ'?'https://qoj.ac':'https://ac.nowcoder.com').href}));
 });
 if(!output.length&&!/no submissions|no records|没有提交|暂无记录|暂无数据/i.test(html)&&!(/<table/i.test(html)&&/submit time|submission|提交时间/i.test(html))) throw new SourceError('无法识别平台提交页面，本次没有导入。');
 return output;
}
export async function collect(account,secret='') {
 const platform=account.platform_name, login=account.login_name, items=[];
 let cursor=Math.max(0,Number(account.sync_cursor||0)-86400), note='', partial=false;
 if(platform==='Codeforces'){
  for(let page=0;page<10;page++){
   const url=new URL('https://codeforces.com/api/user.status');
   url.search=new URLSearchParams({handle:login,from:String(1+page*500),count:'500'});
   const body=await (await request(url)).json();
   if(body.status!=='OK') throw new SourceError('Codeforces 未能读取该账号，请检查用户名或稍后重试。');
   if(!Array.isArray(body.result)) throw new SourceError('Codeforces 数据格式异常。');
   items.push(...body.result.map(normalizeCF).filter(Boolean));
   if(body.result.length<500) break;
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
  for(let page=1;page<=20;page++){
   const url=platform==='QOJ'?new URL('https://qoj.ac/submissions'):new URL('https://ac.nowcoder.com/acm/contest/profile/'+account.remote_uid+'/practice-coding');
   url.search=new URLSearchParams(platform==='QOJ'?{submitter:login,min_score:'100',max_score:'100',page:String(page)}:{page:String(page),pageSize:'200',statusTypeFilter:'5',orderType:'DESC',languageCategoryFilter:'-1'});
   const html=await (await request(url,{headers:{Referer:platform==='QOJ'?'https://qoj.ac/':'https://ac.nowcoder.com/',...(secret?{Cookie:secret}:{})}})).text();
   const rows=parseAcceptedPage(html,platform,login);items.push(...rows);
   const next=new RegExp('(?:page|pageNo)='+String(page+1)+'(?:[^0-9]|$)').test(html);
   if(!next) break;
   if(page===20) partial=true; else await pause(1200);
  }
  note='仅导入可见的 AC 提交，失败提交、完整提交次数和缺失历史无法推算。'+(partial?'本次达到 20 页上限，更早记录暂未覆盖。':'');
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
 return {items:[...new Map(items.map(s=>[s.id,s])).values()],cursor,note,partial};
}
