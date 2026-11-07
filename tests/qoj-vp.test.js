import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreVp,parseQojVpProfile} from '../src/backend/qoj-vp.js';

test('VP scoring counts only the first in-window AC and its penalized attempts',()=>{
 const entry=(key,time,verdict,contest='123')=>({
  source_key:key,submitted_at:'2026-11-02 '+time,verdict,passed:verdict==='AC'?1:0,
  problem_url:'https://qoj.ac/contest/'+contest+'/problem/'+key
 });
 const session={contest_key:'123',starts_at:'2026-11-02 10:00:00'};
 const rows=[
  entry('1','09:59:59','WA'),entry('1','10:01:00','CE'),entry('1','10:02:00','WA'),
  entry('1','10:10:59','AC'),entry('1','10:11:00','WA'),entry('1','10:12:00','AC'),
  entry('2','14:59:59','WA'),entry('2','15:00:00','AC'),
  entry('3','15:59:59','WA'),entry('3','16:00:00','AC'),entry('4','10:05:00','AC','999')
 ];
 const score=scoreVp(session,rows,[], '2026-11-02 16:00:00');
 assert.equal(score.solved,1);
 assert.equal(score.penalty,30);
 assert.equal(score.upsolved,1);
 assert.equal(score.items[0].wrong,1);
 assert.equal(score.items[1].lastVerdict,'WA');
 assert.equal(score.items[1].afterAc,'2026-11-02 15:00:00');
 assert.equal(score.items[2].afterAc,undefined);
 assert.equal(score.items.length,3);
});

test('profile parser reads the VP table and normalizes its explicit offset',()=>{
 const html='<h4>Virtual Participations: 1</h4><div><table><tr><td><a href="/contest/123">Regional</a></td>'+
 '<td><time datetime="2026-11-02T09:39:17Z">09:39:17</time></td></tr></table></div>';
 assert.deepEqual(parseQojVpProfile(html),[{contest:'123',name:'Regional',startsAt:'2026-11-02 17:39:17'}]);
 assert.throws(()=>parseQojVpProfile(html.replace('Participations: 1','Participations: 2')),/Incomplete/);
});

test('VP medals distinguish an original award line from no award and missing evidence', async () => {
 const {estimateVpMedal,originalBoard}=await import('../src/backend/qoj-vp-medals.js');
 const score={solved:12,items:[{acSeconds:59,wrong:0}]};
 assert.equal(estimateVpMedal('1893',score,true).tier,'gold');
 assert.equal(estimateVpMedal('1893',score,false).tier,'unknown');
 assert.equal(estimateVpMedal('1893',{solved:0,items:[]},true).tier,'below');
 assert.equal(estimateVpMedal('1358',score,true).tier,'noAward');
 assert.equal(estimateVpMedal('1695',score,true).tier,'unknown');
 assert.match(originalBoard('1893').url,/icpc2024hangzhou$/);
});
