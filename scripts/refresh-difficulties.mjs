import mysql from 'mysql2/promise';
import {getDifficultyMetadata,applyDifficultyMetadata} from '../src/backend/difficulty-metadata.js';
const connection=await mysql.createConnection({
 host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),
 user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD,
 database:process.env.DB_NAME||'acmer_stats'});
try{
 for(const platform of ['Codeforces','AtCoder']){
  const metadata=await getDifficultyMetadata(platform);
  const [[p]]=await connection.execute('SELECT platform_id FROM platform WHERE platform_name=?',[platform]);
  if(!p)continue;
  await connection.beginTransaction();
  try{
   const count=await applyDifficultyMetadata(connection,p.platform_id,platform,metadata);
   await connection.commit();
   console.log(platform+': updated '+count+' problem ratings; no submissions or counters changed.');
  }catch(error){await connection.rollback();throw error;}
 }
}finally{await connection.end();}
