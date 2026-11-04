export const definitions=[
 ['dp','动态规划','Dynamic Programming',['动态规划','dynamic programming','动态规划 DP']],
 ['greedy','贪心','Greedy',['贪心','贪心算法']],
 ['math','数学','Mathematics',['数学','mathematics']],
 ['graphs','图论','Graph Theory',['图论','graph theory']],
 ['strings','字符串','Strings',['字符串','string']],
 ['data structures','数据结构','Data Structures',['数据结构']],
 ['binary search','二分查找','Binary Search',['二分','二分查找']],
 ['dfs and similar','深度优先搜索及相关','DFS and Similar',['深度优先搜索','dfs','深度优先搜索 DFS']],
 ['bfs','广度优先搜索','BFS',['广度优先搜索','广度优先搜索 BFS']],
 ['sortings','排序','Sorting',['排序','sorting']],
 ['implementation','模拟与实现','Implementation',['模拟','实现']],
 ['constructive algorithms','构造','Constructive Algorithms',['构造','构造算法']],
 ['brute force','暴力枚举','Brute Force',['暴力','枚举','暴力枚举']],
 ['number theory','数论','Number Theory',['数论']],
 ['bitmasks','位运算与状态压缩','Bitmasks',['位运算','状态压缩']],
 ['two pointers','双指针','Two Pointers',['双指针']],
 ['trees','树','Trees',['树','树结构','树论']],
 ['combinatorics','组合数学','Combinatorics',['组合数学','组合计数']],
 ['games','博弈','Game Theory',['博弈','博弈论','game theory']],
 ['dsu','并查集','DSU',['并查集','disjoint set union']],
 ['interactive','交互','Interactive',['交互','交互题']],
 ['probabilities','概率','Probability',['概率','概率论','probability']],
 ['geometry','计算几何','Geometry',['计算几何','几何']],
 ['divide and conquer','分治','Divide and Conquer',['分治']],
 ['2-sat','二元可满足性','2-SAT',['2sat','2-sat']],
 ['string suffix structures','字符串后缀结构','String Suffix Structures',['后缀结构']],
 ['matrices','矩阵','Matrices',['矩阵','matrix','矩阵运算']],
 ['ternary search','三分查找','Ternary Search',['三分','三分查找']],
 ['hashing','哈希','Hashing',['哈希','hash']],
 ['graph matchings','图匹配','Graph Matching',['图匹配','graph matching']],
 ['shortest paths','最短路','Shortest Paths',['最短路','最短路径']],
 ['schedules','调度','Scheduling',['调度','scheduling']],
 ['communication','通信','Communication',['通信']],
 ['flows','网络流','Network Flow',['网络流','network flow']],
 ['fft','快速傅里叶变换','FFT',['快速傅里叶变换']],
 ['chinese remainder theorem','中国剩余定理','CRT',['中国剩余定理','crt']],
 ['meet-in-the-middle','折半搜索','Meet-in-the-Middle',['折半搜索']],
 ['expression parsing','表达式解析','Expression Parsing',['表达式解析']],
 ['search','搜索','Search',['搜索']],
 ['basic algorithms','基础算法','Basic Algorithms',['基础算法']],
 ['language basics','语言入门','Language Basics',['语言入门']],
 ['recursion','递归','Recursion',['递归']],
 ['recurrences','递推','Recurrences',['递推']],
 ['segment tree','线段树','Segment Tree',['线段树']],
 ['fenwick tree','树状数组','Fenwick Tree',['树状数组']],
 ['heap','堆','Heap',['堆']],
 ['tree data structures','树形数据结构','Tree Data Structures',['树形数据结构']],
 ['linear data structures','线性数据结构','Linear Data Structures',['线性数据结构']],
 ['knapsack dp','背包动态规划','Knapsack DP',['背包 DP']],
 ['interval dp','区间动态规划','Interval DP',['区间 DP']],
 ['tree dp','树形动态规划','Tree DP',['树形 DP']],
 ['digit dp','数位动态规划','Digit DP',['数位 DP']],
 ['dp optimization','动态规划优化','DP Optimization',['动态规划优化']],
 ['memoization','记忆化搜索','Memoization',['记忆化搜索']],
 ['binary lifting','倍增','Binary Lifting',['倍增']],
 ['coordinate compression','离散化','Coordinate Compression',['离散化']],
 ['prefix sums','前缀和','Prefix Sums',['前缀和']],
 ['difference array','差分','Difference Array',['差分']],
 ['minimum spanning tree','最小生成树','Minimum Spanning Tree',['生成树','最小生成树']],
 ['lca','最近公共祖先','Lowest Common Ancestor',['最近公共祖先 LCA']],
 ['topological sorting','拓扑排序','Topological Sorting',['拓扑排序']],
 ['high precision','高精度','Arbitrary Precision',['高精度']]
];
const normalized=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const lookup=new Map();
for(const [key,zh,en,aliases] of definitions){
 const def={key,display:zh+' / '+en,known:true};
 const bilingual=[key,en,...aliases].filter(a=>/^[\x00-\x7F]+$/.test(a)).map(a=>zh+' '+a);
 for(const alias of [key,zh,en,def.display,...aliases,...bilingual])lookup.set(normalized(alias),def);
}
export function tagDefinition(value){
 const input=String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ');
 return lookup.get(normalized(input))||{key:input.toLowerCase(),display:input,known:false};
}
export async function mergeTagAliases(connection){
 const [rows]=await connection.query('SELECT tag_id,tag_name FROM tag ORDER BY tag_id');
 const groups=new Map();
 for(const row of rows){const def=tagDefinition(row.tag_name);if(!groups.has(def.key))groups.set(def.key,{def,rows:[]});groups.get(def.key).rows.push(row);}
 let merged=0;
 await connection.beginTransaction();
 try{
  for(const {def,rows:group}of groups.values()){
   const keep=group.find(r=>r.tag_name===def.key)||group[0];
   for(const row of group){
    if(row.tag_id===keep.tag_id)continue;
    await connection.execute('INSERT IGNORE INTO problem_tag(problem_id,tag_id) SELECT problem_id,? FROM problem_tag WHERE tag_id=?',[keep.tag_id,row.tag_id]);
    await connection.execute('DELETE FROM problem_tag WHERE tag_id=?',[row.tag_id]);
    await connection.execute('DELETE FROM tag WHERE tag_id=?',[row.tag_id]);merged++;
   }
   await connection.execute('UPDATE tag SET tag_name=?,display_name=? WHERE tag_id=?',[def.key,def.display,keep.tag_id]);
  }
  await connection.commit();return {before:rows.length,after:groups.size,merged};
 }catch(error){await connection.rollback();throw error;}
}
