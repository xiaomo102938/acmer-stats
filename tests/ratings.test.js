import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRating,parseQojRating} from '../src/backend/ratings.js';
test('CF and AT distinguish absent rating, zero and unrated contests',()=>{
 assert.equal(parseRating('Codeforces',{status:'OK',result:[{rating:1720}]}).rating,1720);
 assert.equal(parseRating('Codeforces',{status:'OK',result:[{rating:0}]}).rating,0);
 assert.equal(parseRating('Codeforces',{status:'OK',result:[{}]}).status,'unrated');
 const rows=[{IsRated:true,NewRating:158,EndTime:'2026-01-31T22:40:00+09:00'},{IsRated:false,NewRating:9999,EndTime:'2026-02-01T22:40:00+09:00'},{IsRated:true,NewRating:2,EndTime:'2025-01-11T22:40:00+09:00'}];
 assert.equal(parseRating('AtCoder',rows).rating,158);assert.equal(parseRating('AtCoder',[]).status,'unrated');
 assert.throws(()=>parseRating('AtCoder',[{IsRated:true,NewRating:null,EndTime:'2026-01-01'}]));
});
test('Nowcoder selects latest timestamp; LC absence is not invented as zero',()=>{
 assert.equal(parseRating('牛客',{code:0,data:[{rating:1905,time:200},{rating:1500,time:100}]}).rating,1905);
 assert.throws(()=>parseRating('牛客',{code:1,data:[]}));
 assert.equal(parseRating('LeetCode',{data:{userContestRanking:null}}).status,'unavailable');
 assert.equal(parseRating('LeetCode',{data:{userContestRanking:{rating:1800.52,attendedContestsCount:3}}}).rating,1800.52);
 assert.throws(()=>parseRating('LeetCode',{errors:[{}]}));
});
test('QOJ reads the target user attribute, not AC count or another navbar user',()=>{
 const html='<span class="uoj-username" data-nickname="other" data-rating="9999"></span><span class="uoj-username" data-nickname="target" data-rating="1800" data-rated="1"></span><h4>Rating 变化</h4><p>AC 过的题目：共 271 道题</p>';
 assert.equal(parseQojRating(html,'target').rating,1800);
 assert.throws(()=>parseQojRating(html,'missing'));
 assert.throws(()=>parseQojRating('<h4>Rating 变化</h4><p>AC 271</p>','target'));
 assert.equal(parseQojRating('<span class="uoj-username" data-nickname="target" data-rating="1500" data-rated="0"></span>','target').status,'unrated');
});
