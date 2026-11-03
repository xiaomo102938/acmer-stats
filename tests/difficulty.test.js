import test from 'node:test';
import assert from 'node:assert/strict';
import {atCoderDifficulty,inferProblemKey} from '../src/backend/difficulty-metadata.js';
import {formatDifficulty,difficultyBuckets} from '../src/frontend/difficulty.js';
test('AtCoder display values distinguish missing estimates from low and zero difficulty',()=>{
 assert.equal(atCoderDifficulty({difficulty:790}),'790');
 assert.equal(atCoderDifficulty({difficulty:400}),'400');
 assert.equal(atCoderDifficulty({difficulty:0}),'147');
 assert.equal(atCoderDifficulty({difficulty:-1065}),'10');
 assert.equal(atCoderDifficulty({slope:-0.1}),null);
 assert.equal(atCoderDifficulty({difficulty:null}),null);
});
test('legacy names can be matched to catalog keys without changing problem identity',()=>{
 assert.equal(inferProblemKey('Codeforces','Codeforces 1742E Scuza'),'1742E');
 assert.equal(inferProblemKey('AtCoder','AtCoder ABC308C Standings'),'abc308_c');
 assert.equal(inferProblemKey('AtCoder','AtCoder dp_t'),'dp_t');
});
test('record labels use native rating and mark third-party estimates explicitly',()=>{
 assert.equal(formatDifficulty({platform_name:'Codeforces',native_difficulty:'1800',difficulty:null}),'CF 1800');
 assert.equal(formatDifficulty({platform_name:'AtCoder',native_difficulty:'790',difficulty:null}),'AT 790 · 估计');
 assert.equal(formatDifficulty({platform_name:'AtCoder',native_difficulty:null}),'暂无公开难度');
});
test('difficulty distributions never mix platform scales or confuse missing data with zero',()=>{
 const rows=[{platform_name:'Codeforces',native_difficulty:'1800',total_count:3},{platform_name:'AtCoder',native_difficulty:'0',total_count:2},{platform_name:'AtCoder',native_difficulty:null,total_count:1}];
 assert.deepEqual(difficultyBuckets(rows,'Codeforces'),[{name:'1600–1999',value:3}]);
 assert.deepEqual(difficultyBuckets(rows,'AtCoder'),[{name:'0–399',value:2},{name:'暂无公开难度',value:1}]);
});
