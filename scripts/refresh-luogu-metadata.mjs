import mysql from 'mysql2/promise';
import {enrichLuoguProblems} from '../src/backend/luogu-metadata.js';
import {mergeTagAliases} from '../src/backend/tags.js';
const c=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD,database:process.env.DB_NAME||'acmer_stats'});
try{
 const [[p]]=await c.query("SELECT platform_id FROM platform WHERE platform_name='洛谷'");
 console.log(await enrichLuoguProblems(c,p.platform_id,'',(n,total)=>console.log('Luogu metadata',n,'/',total)));
 console.log(await mergeTagAliases(c));
}finally{await c.end();}
