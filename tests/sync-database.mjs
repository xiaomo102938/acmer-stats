// Uses an isolated temporary database cloned from current table definitions.
// Run: node --env-file=.env tests/sync-database.mjs
import mysql from 'mysql2/promise';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {saveSubmissions} from '../src/backend/sync-store.js';
const connection=await mysql.createConnection({
 host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3306),
 user:process.env.DB_USER||'root',password:process.env.DB_PASSWORD,
 database:process.env.DB_NAME||'acmer_stats',dateStrings:true,decimalNumbers:true});
const name='acmer_stats_test_'+randomBytes(6).toString('hex');
assert.match(name,/^acmer_stats_test_[0-9a-f]{12}$/);
let created=false;
try{
 const ddls=[];
 for(const table of ['user','platform','problem','tag','problem_tag','record','platform_account','synced_submission']){
  const [[row]]=await connection.query('SHOW CREATE TABLE '+connection.escapeId(table));ddls.push(row['Create Table']);
 }
 await connection.query('CREATE DATABASE '+connection.escapeId(name)+' CHARACTER SET utf8mb4');created=true;
 await connection.query('USE '+connection.escapeId(name));
 for(const ddl of ddls)await connection.query(ddl);
 await connection.query(`CREATE TRIGGER test_record_update BEFORE UPDATE ON record FOR EACH ROW
 BEGIN IF NEW.solve_date>CURDATE() OR NEW.submit_count NOT BETWEEN 1 AND 999 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='invalid record'; END IF; END`);
 await connection.query(`CREATE TRIGGER test_record_insert BEFORE INSERT ON record FOR EACH ROW
 BEGIN IF NEW.solve_date>CURDATE() OR NEW.submit_count NOT BETWEEN 1 AND 999 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='invalid record'; END IF; END`);
 const account={account_id:randomUUID(),user_id:randomUUID(),platform_id:randomUUID(),login_name:'fixture'};
 const problem=randomUUID(),record=randomUUID();
 await connection.execute('INSERT INTO user(user_id,user_name) VALUES(?,?)',[account.user_id,'sync-test']);
 await connection.execute('INSERT INTO platform(platform_id,platform_name) VALUES(?,?)',[account.platform_id,'Codeforces']);
 await connection.execute('INSERT INTO platform_account(account_id,user_id,platform_id,login_name) VALUES(?,?,?,?)',[account.account_id,account.user_id,account.platform_id,account.login_name]);
 await connection.execute("INSERT INTO problem(problem_id,problem_name,difficulty,platform_id) VALUES(?,?,'普及',?)",[problem,'Codeforces 1A Example',account.platform_id]);
 await connection.execute("INSERT INTO record(record_id,passed,submit_count,solve_date,user_id,problem_id,manual_submit_count,manual_passed,manual_solve_date) VALUES(?,1,2,'2026-01-01',?,?,2,1,'2026-01-01')",[record,account.user_id,problem]);
 const item={id:'1',key:'1A',title:'Codeforces 1A Example',time:1769904000,passed:0,tags:['graph','new-tag'],native:'800',url:'https://codeforces.com/problemset/problem/1/A'};
 const result={items:[item,{...item,id:'2',passed:1}],cursor:0,note:'fixture'};
 const first=await saveSubmissions(connection,account,result);assert.equal(first.newSubmissions,2);
 const repeat=await saveSubmissions(connection,account,result);assert.equal(repeat.newSubmissions,0);
 await saveSubmissions(connection,account,{...result,items:[{...item,native:null}]});
 const [[rating]]=await connection.execute('SELECT native_difficulty FROM problem WHERE problem_id=?',[problem]);
 assert.equal(rating.native_difficulty,'800','a missing upstream value must not erase a stored rating');
 const [[state]]=await connection.execute('SELECT submit_count,passed FROM record WHERE record_id=?',[record]);
 assert.equal(state.submit_count,4);assert.equal(state.passed,1);
 const [[tags]]=await connection.execute('SELECT COUNT(*) AS n FROM problem_tag WHERE problem_id=?',[problem]);assert.equal(tags.n,2);
 const rejudge=await saveSubmissions(connection,account,{...result,items:[{...item,passed:1}]});assert.equal(rejudge.updatedSubmissions,1);
 const [[ledger]]=await connection.query('SELECT COUNT(*) AS n FROM synced_submission');assert.equal(ledger.n,2);
 await assert.rejects(saveSubmissions(connection,account,{...result,items:[{...item,id:'3',time:4102444800}]}));
 const [[after]]=await connection.query('SELECT COUNT(*) AS n FROM synced_submission');assert.equal(after.n,2,'failed writes should roll back ledger inserts');
 const [[unchanged]]=await connection.execute('SELECT submit_count FROM record WHERE record_id=?',[record]);assert.equal(unchanged.submit_count,4);
 console.log('PASS: initial sync, idempotent resync, manual record preservation, tag association, rejudging and transaction rollback');
}finally{
 if(created)await connection.query('DROP DATABASE '+connection.escapeId(name));
 await connection.end();
}
