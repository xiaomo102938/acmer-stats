import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotMetrics} from '../src/backend/ability-trends.js';
import {abilityTrendPoints} from '../src/frontend/ability-trends.js';
import {defaultSkills} from '../src/shared/skill-settings.js';

test('snapshots reuse scored problem samples and distinguish changed specialty scopes',()=>{
 const config=defaultSkills();config.specialties=['dp'];config.names.dp='动态规划';
 const cf={problem_id:'1',source_key:'1A',platform_name:'Codeforces',passed:1,native_difficulty:1900,difficulty_source:'codeforces'};
 const tagged={...cf,tag_id:'tree dp',tag_name:'tree dp',display_name:'树形动态规划'};
 const first=snapshotMetrics([cf],[tagged],config);
 assert.deepEqual(first.all,{score:9.5,count:1,limit:200});
 assert.equal(first.specialty.score,19);
 assert.deepEqual(first.topics.map(({key,score,count,limit})=>({key,score,count,limit})),[{key:'dp',score:null,count:0,limit:15}]);
 config.includeDescendants=false;
 const changed=snapshotMetrics([cf],[tagged],config);
 assert.equal(changed.specialty.score,0);
 assert.notEqual(first.specialty.scope,changed.specialty.scope);
 assert.equal(first.topics[0].scope,changed.topics[0].scope);
 config.aliases={'tree dp':'dp'};
 const merged=snapshotMetrics([cf],[tagged],config);
 assert.equal(merged.topics[0].score,126.7);
 assert.notEqual(changed.topics[0].scope,merged.topics[0].scope);
});

test('trend keeps discontinuities between changed definitions and missing samples',()=>{
 const row=(day,score,scope='x',version='v1')=>({at:'2026-11-0'+day+'T00:00:00.000Z',version,
  specialty:{score,scope},topics:score==null?[]:[{key:'dp',score,scope}]});
 const history=[row(1,1800),row(2,1850,'y'),row(3,null),row(4,1900,'y'),row(5,2000,'y','v2')];
 for(const scope of ['specialty','topic:dp']){
  assert.deepEqual(abilityTrendPoints(history,scope).map(point=>point.value[1]),[1800,null,1850,null,1900,null,2000]);
 }
});
