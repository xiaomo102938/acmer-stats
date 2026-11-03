import test from 'node:test';
import assert from 'node:assert/strict';
import {tagDefinition} from '../src/backend/tags.js';
test('Chinese, English and bilingual aliases resolve to one canonical tag',()=>{
 for(const value of ['dp','动态规划','Dynamic Programming','动态规划 / Dynamic Programming'])assert.equal(tagDefinition(value).key,'dp');
 for(const value of ['greedy','贪心','贪心算法'])assert.equal(tagDefinition(value).key,'greedy');
 assert.equal(tagDefinition('数据结构').key,'data structures');
 assert.equal(tagDefinition('二分').key,'binary search');
});
test('related but distinct tags are not collapsed into parent categories',()=>{
 assert.notEqual(tagDefinition('graphs').key,tagDefinition('graph matchings').key);
 assert.notEqual(tagDefinition('dfs and similar').key,tagDefinition('图论').key);
 assert.notEqual(tagDefinition('digit dp').key,tagDefinition('动态规划').key);
 assert.equal(tagDefinition('Unlisted technique').display,'Unlisted technique');
});
