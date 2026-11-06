import {load} from 'cheerio';
import {setTimeout as pause} from 'node:timers/promises';

const catalog='https://ac.nowcoder.com/acm/problem/list';
const unavailableUntil=new Map();

export function nowcoderDifficulty(html,key){
 const $=load(html);
 const table=$('table').filter((_i,element)=>$(element).find('th').toArray().some(th=>$(th).text().trim()==='难度')).first();
 if(!table.length)throw new Error('牛客题库未返回难度表');
 const column=table.find('th').toArray().findIndex(th=>$(th).text().trim()==='难度');
 const row=table.find('tr').filter((_i,element)=>$(element).children('td').first().text().trim()==='NC'+key).first();
 let position=0;
 let value='';
 for(const cell of row.children('td').toArray()){
  const width=Number($(cell).attr('colspan'))||1;
  if(column<position+width){value=$(cell).text().trim();break;}
  position+=width;
 }
 return /^\d+$/.test(value)&&Number(value)>0&&Number(value)<=4500?value:null;
}

export async function enrichNowcoderDifficulty(connection,platformId){
 const [rows]=await connection.execute("SELECT problem_id,source_key FROM problem WHERE platform_id=? AND native_difficulty IS NULL AND source_key REGEXP '^[0-9]+$' ORDER BY problem_id",[platformId]);
 let updated=0;
 for(const row of rows){
  const key=row.source_key;
  if((unavailableUntil.get(key)??0)>Date.now())continue;
  const url=new URL(catalog);
  url.searchParams.set('keyword',key);
  let native;
  try{
   await pause(600);
   const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(12000)});
   if(!response.ok){
    await response.body?.cancel();
    return {updated,deferred:true};
   }
   native=nowcoderDifficulty(await response.text(),key);
  }catch{
   return {updated,deferred:true};
  }
  if(native===null){
   unavailableUntil.set(key,Date.now()+6*60*60*1000);
   continue;
  }
  const [result]=await connection.execute("UPDATE problem SET native_difficulty=?,difficulty_source='nowcoder' WHERE problem_id=? AND native_difficulty IS NULL",[native,row.problem_id]);
  updated+=result.affectedRows;
 }
 return {updated,deferred:false};
}
