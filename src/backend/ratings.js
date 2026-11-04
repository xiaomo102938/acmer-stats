import express from 'express';
import {load} from 'cheerio';
import {decrypt} from './secrets.js';
import {qojFetch,qojTransport} from './qoj-network.js';
const ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
export const ratingScales={Codeforces:'Codeforces Rating',AtCoder:'AtCoder Algorithm Rating','牛客':'牛客竞赛 Rating',QOJ:'QOJ Rating',LeetCode:'力扣中国竞赛 Rating','洛谷':'竞赛 Rating'};
const number=value=>value!==null&&value!==undefined&&value!==''&&typeof value!=='boolean'&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=100000?Number(value):null;
const unrated=message=>({rating:null,status:'unrated',message});
export function parseRating(platform,body){
 if(platform==='Codeforces'){
  if(body.status!=='OK'||!Array.isArray(body.result)||body.result.length!==1)throw new Error('Invalid CF profile');
  const row=body.result[0];if(row.rating==null)return unrated('暂无评级记录');
  const rating=number(row.rating);if(rating==null)throw new Error('Invalid rating');return {rating,status:'ok',message:'官方个人资料'};
 }
 if(platform==='AtCoder'){
  if(!Array.isArray(body))throw new Error('Invalid AT history');
  const rows=body.filter(r=>r.IsRated===true);if(!rows.length)return unrated('暂无 Algorithm 评级赛记录');
  if(rows.some(r=>number(r.NewRating)==null||!Number.isFinite(Date.parse(r.EndTime))))throw new Error('Invalid AT rating');
  rows.sort((a,b)=>Date.parse(b.EndTime)-Date.parse(a.EndTime));return {rating:number(rows[0].NewRating),status:'ok',message:'最新一场 Algorithm 评级赛后的分数'};
 }
 if(platform==='牛客'){
  if(body.code!==0||!Array.isArray(body.data))throw new Error('Invalid Nowcoder history');
  if(!body.data.length)return unrated('暂无公开评级赛记录');
  if(body.data.some(r=>number(r.rating)==null||!Number.isFinite(Number(r.time))))throw new Error('Invalid Nowcoder rating');
  const row=[...body.data].sort((a,b)=>Number(b.time)-Number(a.time))[0];return {rating:number(row.rating),status:'ok',message:'最新竞赛评级记录'};
 }
 if(platform==='LeetCode'){
  if(body.errors||!body.data||!Object.hasOwn(body.data,'userContestRanking'))throw new Error('Invalid LC rating');
  const row=body.data.userContestRanking;if(!row)return {rating:null,status:'unavailable',message:'暂无公开竞赛分数，请核对用户标识及评级赛记录'};
  if(row.attendedContestsCount===0)return unrated('暂无竞赛评级记录');
  const rating=number(row.rating);if(rating==null)throw new Error('Invalid LC rating');return {rating,status:'ok',message:'力扣中国公开竞赛分数'};
 }
 throw new Error('Unsupported rating parser');
}
export function parseQojRating(html,login){
 const dom=load(html);if(dom('input[type=password]').length||/Just a moment|cf-chl-/i.test(dom('title').text()))throw new Error('QOJ login or challenge');
 // Match the requested user explicitly: the navbar may contain another logged-in user's rating.
 const entries=dom('.uoj-username[data-rating]').toArray().filter(e=>String(dom(e).attr('data-nickname')||dom(e).text().trim()).toLowerCase()===String(login||'').toLowerCase());
 if(!entries.length)throw new Error('QOJ user rating field missing');
 if(entries.every(e=>dom(e).attr('data-rated')==='0'))return unrated('暂无评级记录');
 const values=entries.map(e=>number(dom(e).attr('data-rating')));
 if(values.some(r=>r==null)||new Set(values).size!==1)throw new Error('QOJ rating unrecognized');
 return {rating:values[0],status:'ok',message:'QOJ 个人资料中该账号的 Rating 字段'};
}
async function json(url,options={}){
 const r=await fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(18000),headers:{'User-Agent':ua,Accept:'application/json',...options.headers}});
 if(!r.ok)throw new Error('Rating source unavailable');return r.json();
}
export async function collectRating(account,secret=''){
 const platform=account.platform_name,login=encodeURIComponent(account.login_name);let source,body;
 if(platform==='洛谷')return {rating:null,status:'unsupported',message:'暂未接入竞赛 Rating，不使用洛谷估值替代',source:null};
 if(platform==='Codeforces'){source='https://codeforces.com/api/user.info?handles='+login;body=await json(source);}
 else if(platform==='AtCoder'){source='https://atcoder.jp/users/'+login+'/history/json';body=await json(source);}
 else if(platform==='牛客'){
  if(!/^\d+$/.test(account.remote_uid||''))throw new Error('Nowcoder UID missing');
  source='https://ac.nowcoder.com/acm/contest/rating-history?uid='+account.remote_uid;body=await json(source,{headers:{Referer:'https://ac.nowcoder.com/'}});
 }else if(platform==='QOJ'){
  source='https://qoj.ac/user/profile/'+login;
  const response=await qojFetch(source,{...await qojTransport(),redirect:'manual',signal:AbortSignal.timeout(18000),headers:{'User-Agent':ua,Accept:'text/html',...(secret?{Cookie:secret}:{})}});
  if(!response.ok)throw new Error('QOJ profile unavailable');return {...parseQojRating(await response.text(),account.login_name),source};
 }else if(platform==='LeetCode'){
  source='https://leetcode.cn/graphql/noj-go/';body=await json(source,{method:'POST',headers:{'Content-Type':'application/json',Referer:'https://leetcode.cn/'},body:JSON.stringify({query:'query($userSlug:String!){userContestRanking(userSlug:$userSlug){rating attendedContestsCount}}',variables:{userSlug:account.login_name}})});
 }else return {rating:null,status:'unsupported',message:'暂未接入竞赛 Rating',source:null};
 return {...parseRating(platform,body),source};
}
export async function refreshAccountRating(connection,account,secret=''){
 const scale=ratingScales[account.platform_name]||'Rating';
 try{
  const result=await collectRating(account,secret);
  await connection.execute(`INSERT INTO account_rating(account_id,rating,scale,status,message,source_url,fetched_at,last_attempt) VALUES(?,?,?,?,?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE rating=VALUES(rating),scale=VALUES(scale),status=VALUES(status),message=VALUES(message),source_url=VALUES(source_url),fetched_at=NOW(),last_attempt=NOW()`,[account.account_id,result.rating,scale,result.status,result.message,result.source]);
 }catch{
  await connection.execute(`INSERT INTO account_rating(account_id,rating,scale,status,message,last_attempt) VALUES(?,NULL,?,'error',?,NOW()) ON DUPLICATE KEY UPDATE status='error',message=VALUES(message),last_attempt=NOW()`,[account.account_id,scale,'暂时无法获取，请检查平台访问、账号标识或登录会话；已有分数保留']);
 }
}
export function ratingRouter(pool){
 const router=express.Router();let busy=false;
 async function owner(){const [[row]]=await pool.query('SELECT user_id FROM user ORDER BY user_id LIMIT 1');return row?.user_id||'';}
 router.get('/',async(_req,res)=>{
  const [rows]=await pool.execute(`SELECT a.account_id,a.login_name,p.platform_name,r.rating,r.scale,COALESCE(r.status,'not_synced') AS status,r.message,r.source_url,r.fetched_at,r.last_attempt FROM platform_account a JOIN platform p ON p.platform_id=a.platform_id LEFT JOIN account_rating r ON r.account_id=a.account_id WHERE a.user_id=? ORDER BY p.platform_name,a.login_name`,[await owner()]);
  res.set('Cache-Control','no-store').json({ratings:rows});
 });
 router.post('/refresh',async(_req,res)=>{
  if(busy)return res.status(409).json({message:'Rating 正在更新，请稍后查看。'});busy=true;
  try{
   const [accounts]=await pool.execute('SELECT a.*,p.platform_name FROM platform_account a JOIN platform p ON p.platform_id=a.platform_id WHERE a.user_id=?',[await owner()]);
   for(let i=0;i<accounts.length;i+=2)await Promise.all(accounts.slice(i,i+2).map(async a=>{const c=await pool.getConnection();try{await refreshAccountRating(c,a,decrypt(a.login_pwd));}finally{c.release();}}));
   res.json({message:'Rating 更新完成，未获取成功的账号会保留已有分数。'});
  }finally{busy=false;}
 });return router;
}
