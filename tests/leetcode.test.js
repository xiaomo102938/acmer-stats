import assert from 'node:assert/strict';import test from 'node:test';import {parseLeetcodeProgress,applyLeetcodeTotals} from '../src/backend/leetcode.js';
const rows=counts=>['EASY','MEDIUM','HARD'].map((difficulty,i)=>({difficulty,count:counts[i]}));
test('public progress includes accepted plus still-failed questions and rejects invalid response',()=>{
 assert.deepEqual(parseLeetcodeProgress({data:{userProfileUserQuestionProgress:{numAcceptedQuestions:rows([41,74,23]),numFailedQuestions:rows([0,3,1])}}}),{passed:138,attempted:142});
 assert.throws(()=>parseLeetcodeProgress({errors:[{}]}));
 assert.throws(()=>parseLeetcodeProgress({data:{userProfileUserQuestionProgress:{numAcceptedQuestions:rows([41,-1,23]),numFailedQuestions:rows([0,3,1])}}}));
});
test('profile totals replace partial platform counts once; overlapping multi-account totals are not summed',()=>{
 const o=[{user_id:'u',total_problems:100,passed_problems:80}],p=[{platform_name:'LeetCode',total_count:3,passed_count:3}],s=[{user_id:'u',platform_name:'LeetCode',profile_passed_count:138,profile_attempted_count:142}];
 applyLeetcodeTotals(o,p,s);assert.equal(o[0].total_problems,239);assert.equal(o[0].passed_problems,215);assert.equal(p[0].passed_count,138);
 applyLeetcodeTotals(o,p,s);assert.equal(o[0].total_problems,239);
 applyLeetcodeTotals(o,p,[...s,...s]);assert.equal(o[0].total_problems,239);
});
