import { validateSkills } from '../src/shared/skill-settings.js';
import { mergeTopology } from '../src/shared/topology-merge.js';

const branches = {
 'basic algorithms': ['implementation','sortings','greedy','two pointers','coordinate compression','bitmasks','constructive algorithms','interactive','communication','schedules','其它技巧','随机化'],
 greedy: ['反悔贪心'],
 'two pointers': ['双指针 two-pointer'],
 search: ['recursion','剪枝','ternary search','模拟退火','梯度下降法'],
 recursion: ['recurrences'],
 recurrences: ['线性递推'],
 'binary search': ['整体二分'],
 'divide and conquer': ['cdq 分治'],
 graphs: ['2-sat','graph matchings','games'],
 'shortest paths': ['负权环'],
 trees: ['binary lifting','树链剖分'],
 'data structures': ['tree data structures','linear data structures','分块','可持久化','st 表','bitset','stl','优先队列'],
 'tree data structures': ['平衡树','树套树','k-d tree'],
 'linear data structures': ['链表','队列','栈'],
 队列: ['单调队列'],
 分块: ['莫队'],
 'segment tree': ['可持久化线段树','李超线段树'],
 strings: ['字典树 trie','kmp 算法','manacher 算法','回文自动机 pam'],
 '字典树 trie': ['ac 自动机'],
 'string suffix structures': ['后缀数组 sa','后缀自动机 sam'],
 math: ['high precision','进制','线性代数','微积分','多项式','组合优化','群论'],
 'number theory': ['不定方程','大步小步算法 bsgs','二次剩余','莫比乌斯反演','逆元','欧拉函数','素数判断','线性筛法','原根','整除分块','chinese remainder theorem','最大公约数 gcd','dirichlet 卷积'],
 欧拉函数: ['欧拉降幂'],
 combinatorics: ['排列组合','容斥原理','置换','lucas 定理','pólya 定理','stirling 数'],
 微积分: ['导数','积分','调和级数'],
 积分: ['定积分'],
 线性代数: ['向量','高斯消元','线性规划'],
 matrices: ['矩阵乘法'],
 多项式: ['快速数论变换 ntt','拉格朗日插值法'],
 线性递推: ['berlekamp-massey(bm) 算法'],
 geometry: ['凸包']
};

const url = 'http://127.0.0.1:3000/api/skill-settings';
const headers = {'Content-Type':'application/json','X-Acmer-Request':'1'};
async function request(options) {
 const response = await fetch(url, options);
 const body = await response.json();
 if (!response.ok) throw new Error(body.message);
 return body;
}

let state = await request();
if (state.topologyDraft) throw new Error('请先应用或放弃现有拓扑草稿。');
const config = structuredClone(state.config);
const known = new Set(state.catalog.map(t => t.key));
const included = new Set(config.nodes.map(n => n.id));
const parentByTag = new Map(Object.entries(branches).flatMap(([parent, children]) => children.map(child => [child, parent])));
const added = [];
for (const {key} of state.catalog) {
 if (included.has(key) || Object.hasOwn(config.aliases,key)) continue;
 added.push(key);
 included.add(key);
}
for (const key of added) {
 const parent = parentByTag.get(key);
 config.nodes.push({id:key,parent:parent && included.has(parent) ? parent : null,secondary:[]});
}
validateSkills(config,state.catalog);

const first = '双指针 two-pointer';
const second = 'two pointers';
let plan;
if (known.has(first) && known.has(second) && !Object.hasOwn(config.aliases,first)) {
 // Make the synonym a sibling under the same tree, so the existing canonical node stays in place.
 const source = config.nodes.find(n => n.id === first);
 const target = config.nodes.find(n => n.id === second);
 if (added.includes(first) && target?.parent) source.parent = target.parent;
 plan = mergeTopology(config,first,second,state.catalog);
 if (plan.conflict || plan.keep !== second) throw new Error(plan.conflict || '归并会改变标准标签，请检查现有配置。');
}
const result = plan?.config || config;
console.log(JSON.stringify({added:added.length,nodes:result.nodes.length,roots:result.nodes.filter(n=>!n.parent).length,aliases:result.aliases,unclassified:added.filter(key=>!parentByTag.has(key))}));
if (!process.argv.includes('--apply')) process.exit(0);
if (added.length) {
 const saved = await request({method:'PATCH',headers,body:JSON.stringify({module:'topology',revision:state.revision,draftRevision:state.draftRevision,value:{nodes:config.nodes,names:config.names,positions:config.positions}})});
 state = saved;
}
if (plan) await request({method:'PATCH',headers,body:JSON.stringify({module:'merge',revision:state.revision,first,second})});
console.log('已应用补全配置。');
