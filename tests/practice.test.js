import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recommendProblems,retryProblems} from '../src/backend/practice.js';

test('retry list keeps the newest attempt per canonical problem and excludes known AC',()=>{
 const cf=(key,extra={})=>({problem_id:key,source_key:key,platform_name:'Codeforces',...extra});
 const newest=cf('102A',{verdict:'TLE'});
 const mirror={problem_id:'mirror',source_key:'CF102A',platform_name:'洛谷',tag_name:'dp'};
 const latest=[cf('101A'),newest,cf('102A',{verdict:'WA'}),cf('103A')];
 const progress=[{...mirror,source_key:'CF101A',passed:1},cf('102A',{passed:0}),cf('103A',{passed:0})];
 assert.deepEqual(retryProblems(latest,progress,[mirror],null),[newest,latest[3]]);
 assert.deepEqual(retryProblems(latest,progress,[mirror],new Set(['dp'])),[newest]);
 assert.deepEqual(retryProblems(latest,[...progress,{...mirror,passed:1}],[mirror],new Set(['dp'])),[]);
});

test('recommendations respect merged tags, difficulty range and known attempts',()=>{
 const problem=(native,tags=['dp'])=>({native,tags,url:'https://codeforces.com/problemset',title:'题目'});
 const catalog=new Map([
  ['1A',problem('1700')],['2A',problem('1700')],['3A',problem('1600',['dynamic programming'])],
  ['4A',problem('1900')],['5A',problem('2000')],['6A',problem('1700',['greedy'])],['7A',problem(null)]
 ]);
 const progress=[
  {platform_name:'Codeforces',source_key:null,problem_name:'Codeforces 1A Example',passed:0},
  {platform_name:'洛谷',source_key:'CF2A',passed:1}
 ];
 const config={aliases:{'dynamic programming':'dp'}};
 assert.deepEqual(recommendProblems(catalog,progress,config,'dp',1700).map(p=>p.problem_id),['3A','4A']);
});
