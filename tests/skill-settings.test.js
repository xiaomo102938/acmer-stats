import test from 'node:test';import assert from 'node:assert/strict';
import {defaultSkills,skillCatalog,validateSkills,mergeSkillRows,mergeDraft,specialtyKeys} from '../src/shared/skill-settings.js';
import {specialtyAbility} from '../src/backend/skill-settings.js';import {abilityProfiles} from '../src/backend/ability.js';
const catalog=skillCatalog([{tag_name:'new dp',display_name:'新标签'},{tag_name:'unrelated',display_name:'其他'}]);
test('default graph passes; reject solid, dashed and mixed cycles, duplicate and root predecessors',()=>{
 const c=defaultSkills();assert.equal(validateSkills(c,catalog),c);
 for(const edit of [c=>{c.nodes.find(n=>n.id==='dp').parent='tree dp';},c=>{c.nodes.find(n=>n.id==='trees').secondary.push('tree dp');},c=>{c.nodes.find(n=>n.id==='graphs').parent='tree dp';},c=>{c.nodes.find(n=>n.id==='tree dp').secondary.push('dp');},c=>{c.nodes.find(n=>n.id==='dp').secondary=['graphs'];}]){const bad=defaultSkills();edit(bad);assert.throws(()=>validateSkills(bad,catalog));}
 const bad=defaultSkills();bad.nodes.find(n=>n.id==='tree dp').parent='missing';assert.throws(()=>validateSkills(bad,catalog));
});
test('aliases reversible without changing raw rows; union deduplicates same problem and rejects merge chain',()=>{
 let c=mergeDraft(defaultSkills(),'new dp','dp');validateSkills(c,catalog);
 const rows=[{problem_id:'one',platform_name:'Codeforces',source_key:'1A',tag_id:'1',tag_name:'dp',passed:1,native_difficulty:1800,difficulty_source:'codeforces'},{problem_id:'one',platform_name:'Codeforces',source_key:'1A',tag_id:'2',tag_name:'new dp',passed:1,native_difficulty:1800,difficulty_source:'codeforces'}];
 const merged=abilityProfiles(mergeSkillRows(rows,c));assert.equal(merged.length,1);assert.equal(merged[0].passed_count,1);assert.equal(merged[0].sample_count,1);assert.equal(rows[1].tag_name,'new dp');
 delete c.aliases['new dp'];assert.equal(abilityProfiles(mergeSkillRows(rows,c)).length,2);
 c.aliases={'new dp':'dp',dp:'graphs'};assert.throws(()=>validateSkills(c,catalog));assert.throws(()=>mergeDraft(defaultSkills(),'dp','graphs'));
});
test('specialty closure follows only primary descendants and top 125 deduplicates aliases and mirrors',()=>{
 const c=defaultSkills();c.specialties=['graphs'];const keys=specialtyKeys(c);assert.ok(keys.has('trees'));assert.ok(!keys.has('tree dp'));
 c.specialties=['dp'];const problems=Array.from({length:170},(_,i)=>({problem_id:String(i),platform_name:'Codeforces',source_key:i+'A',passed:1,native_difficulty:800+i*10,difficulty_source:'codeforces'}));
 const rows=problems.map(p=>({...p,tag_name:'tree dp'}));rows.push({...problems[0],tag_name:'dp'});
 let result=specialtyAbility(problems,rows,c);assert.equal(result.sample_count,125);assert.equal(result.min_difficulty,1250);assert.equal(result.passed_count,170);
 c.includeDescendants=false;result=specialtyAbility(problems,rows,c);assert.equal(result.sample_count,1);
 c.specialties=[];assert.equal(specialtyAbility(problems,rows,c).configured,false);assert.equal(specialtyAbility(problems,rows,c).sample_count,0);assert.equal(specialtyAbility(problems,rows,c,'all').sample_count,170);
});

test('custom graph folds arbitrary depth and renders secondary edges only between visible nodes',async()=>{
 const {customSkillGraph}=await import('../src/frontend/skill-graph-model.js');
 const c={nodes:[{id:'dp',parent:null,secondary:[]},{id:'tree dp',parent:'dp',secondary:[]},{id:'new dp',parent:'tree dp',secondary:['dp']}],names:{dp:'动态规划 / DP'},aliases:{},specialties:[],includeDescendants:true};
 validateSkills(c,catalog);assert.equal(customSkillGraph([],[],c).nodes.length,1);
 const g=customSkillGraph([],['dp','tree dp'],c);assert.equal(g.nodes.length,3);assert.equal(g.edges.length,3);assert.equal(g.nodes[0].name,'动态规划');assert.ok(g.edges.some(e=>e.kind==='related'&&e.from==='dp'&&e.to==='new dp'));
});
