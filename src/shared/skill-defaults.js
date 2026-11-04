// Curated knowledge relationships, not a strict curriculum or inferred prerequisites.
export const families=[
 {id:'dp',name:'动态规划',children:[['digit dp','数位 DP'],['tree dp','树形 DP'],['knapsack dp','背包 DP'],['interval dp','区间 DP'],['memoization','记忆化搜索'],['dp optimization','DP 优化']]},
 {id:'graphs',name:'图论',children:[['trees','树'],['shortest paths','最短路'],['minimum spanning tree','最小生成树'],['topological sorting','拓扑排序'],['flows','网络流'],['dsu','并查集']]},
 {id:'data structures',name:'数据结构',children:[['segment tree','线段树'],['fenwick tree','树状数组'],['heap','堆'],['prefix sums','前缀和'],['difference array','差分'],['lca','最近公共祖先']]},
 {id:'math',name:'数学',children:[['number theory','数论'],['combinatorics','组合数学'],['probabilities','概率'],['matrices','矩阵'],['geometry','计算几何'],['fft','FFT']]},
 {id:'strings',name:'字符串',children:[['hashing','哈希'],['string suffix structures','后缀结构']]},
 {id:'search',name:'搜索',children:[['dfs and similar','DFS'],['bfs','BFS'],['binary search','二分查找'],['divide and conquer','分治'],['brute force','暴力枚举']]}
];
export const extraRelations=[['trees','tree dp'],['dfs and similar','tree dp'],['data structures','lca'],['trees','lca'],['number theory','fft']];
