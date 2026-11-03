import mysql from 'mysql2/promise';
import {mergeTagAliases} from '../src/backend/tags.js';
const connection=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD,database:process.env.DB_NAME||'acmer_stats'});
try{console.log(await mergeTagAliases(connection));}finally{await connection.end();}
