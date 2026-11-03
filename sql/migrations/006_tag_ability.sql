USE acmer_stats;
ALTER TABLE tag MODIFY tag_name VARCHAR(120) NOT NULL, ADD display_name VARCHAR(180) NULL;
CREATE OR REPLACE VIEW v_tag_stats AS
SELECT t.tag_id,t.tag_name,COALESCE(t.display_name,t.tag_name) AS display_name,
 COUNT(r.record_id) AS total_count,COALESCE(SUM(r.passed),0) AS passed_count,
 ROUND(COALESCE(SUM(r.passed),0)/NULLIF(COUNT(r.record_id),0)*100,1) AS pass_rate
FROM tag t JOIN problem_tag pt ON pt.tag_id=t.tag_id
JOIN problem pr ON pr.problem_id=pt.problem_id
JOIN record r ON r.problem_id=pr.problem_id
GROUP BY t.tag_id,t.tag_name,t.display_name;
DROP PROCEDURE IF EXISTS sp_tag_rank;
DELIMITER //
CREATE PROCEDURE sp_tag_rank()
BEGIN
 SELECT display_name,total_count,passed_count,pass_rate FROM v_tag_stats
 ORDER BY total_count DESC,passed_count DESC;
END //
DELIMITER ;
CREATE OR REPLACE VIEW v_tag_ability AS
WITH totals AS (
 SELECT r.user_id,pt.tag_id,pr.platform_id,COUNT(*) AS total_count,SUM(r.passed=1) AS passed_count
 FROM record r JOIN problem pr ON pr.problem_id=r.problem_id
 JOIN problem_tag pt ON pt.problem_id=pr.problem_id
 GROUP BY r.user_id,pt.tag_id,pr.platform_id
), ranked AS (
 SELECT r.user_id,pt.tag_id,pr.platform_id,pr.problem_id,CAST(pr.native_difficulty AS DECIMAL(10,2)) AS rating,
 ROW_NUMBER() OVER(PARTITION BY r.user_id,pt.tag_id,pr.platform_id ORDER BY CAST(pr.native_difficulty AS DECIMAL(10,2)) DESC,pr.problem_id) AS position
 FROM record r JOIN problem pr ON pr.problem_id=r.problem_id
 JOIN platform p ON p.platform_id=pr.platform_id JOIN problem_tag pt ON pt.problem_id=pr.problem_id
 WHERE r.passed=1 AND p.platform_name IN ('Codeforces','AtCoder')
 AND pr.native_difficulty REGEXP '^[0-9]+([.][0-9]+)?$'
 AND ((p.platform_name='Codeforces' AND pr.difficulty_source='codeforces')
 OR (p.platform_name='AtCoder' AND pr.difficulty_source IN ('atcoder_problems','atcoder_problems_experimental')))
), ability AS (
 SELECT user_id,tag_id,platform_id,COUNT(*) AS rated_count,
 SUM(position<=25) AS sample_count,
 ROUND(AVG(CASE WHEN position<=25 THEN rating END),1) AS ability_value,
 MIN(CASE WHEN position<=25 THEN rating END) AS min_difficulty,
 MAX(rating) AS max_difficulty
 FROM ranked GROUP BY user_id,tag_id,platform_id
)
SELECT x.user_id,x.tag_id,t.tag_name,COALESCE(t.display_name,t.tag_name) AS display_name,
 x.platform_id,p.platform_name,x.total_count,x.passed_count,
 COALESCE(a.rated_count,0) AS rated_count,COALESCE(a.sample_count,0) AS sample_count,
 a.ability_value,a.min_difficulty,a.max_difficulty,
 CASE WHEN a.sample_count=25 THEN '满25题' WHEN a.sample_count>0 THEN '样本不足' ELSE '暂无有效评分' END AS sample_status
FROM totals x JOIN tag t ON t.tag_id=x.tag_id JOIN platform p ON p.platform_id=x.platform_id
LEFT JOIN ability a ON a.user_id=x.user_id AND a.tag_id=x.tag_id AND a.platform_id=x.platform_id;

-- Normalize legacy aliases and union problem associations in one transaction.
START TRANSACTION;
DROP TEMPORARY TABLE IF EXISTS tag_merge_map;
CREATE TEMPORARY TABLE tag_merge_map AS
SELECT tag_id AS old_id,FIRST_VALUE(tag_id) OVER(PARTITION BY canonical_key ORDER BY (tag_name=canonical_key) DESC,tag_id) AS keep_id,canonical_key,display_name
FROM (SELECT tag_id,tag_name,
CASE
WHEN LOWER(TRIM(tag_name)) IN ('dp','动态规划','dynamic programming','动态规划 / dynamic programming') THEN 'dp'
WHEN LOWER(TRIM(tag_name)) IN ('greedy','贪心','贪心 / greedy','贪心算法') THEN 'greedy'
WHEN LOWER(TRIM(tag_name)) IN ('math','数学','mathematics','数学 / mathematics') THEN 'math'
WHEN LOWER(TRIM(tag_name)) IN ('graphs','图论','graph theory','图论 / graph theory') THEN 'graphs'
WHEN LOWER(TRIM(tag_name)) IN ('strings','字符串','字符串 / strings','string') THEN 'strings'
WHEN LOWER(TRIM(tag_name)) IN ('data structures','数据结构','数据结构 / data structures') THEN 'data structures'
WHEN LOWER(TRIM(tag_name)) IN ('binary search','二分查找','二分查找 / binary search','二分') THEN 'binary search'
WHEN LOWER(TRIM(tag_name)) IN ('dfs and similar','深度优先搜索及相关','深度优先搜索及相关 / dfs and similar','深度优先搜索','dfs') THEN 'dfs and similar'
WHEN LOWER(TRIM(tag_name)) IN ('bfs','广度优先搜索','广度优先搜索 / bfs') THEN 'bfs'
WHEN LOWER(TRIM(tag_name)) IN ('sortings','排序','sorting','排序 / sorting') THEN 'sortings'
WHEN LOWER(TRIM(tag_name)) IN ('implementation','模拟与实现','模拟与实现 / implementation','模拟','实现') THEN 'implementation'
WHEN LOWER(TRIM(tag_name)) IN ('constructive algorithms','构造','构造 / constructive algorithms','构造算法') THEN 'constructive algorithms'
WHEN LOWER(TRIM(tag_name)) IN ('brute force','暴力枚举','暴力枚举 / brute force','暴力','枚举') THEN 'brute force'
WHEN LOWER(TRIM(tag_name)) IN ('number theory','数论','数论 / number theory') THEN 'number theory'
WHEN LOWER(TRIM(tag_name)) IN ('bitmasks','位运算与状态压缩','位运算与状态压缩 / bitmasks','位运算','状态压缩') THEN 'bitmasks'
WHEN LOWER(TRIM(tag_name)) IN ('two pointers','双指针','双指针 / two pointers') THEN 'two pointers'
WHEN LOWER(TRIM(tag_name)) IN ('trees','树','树 / trees','树结构') THEN 'trees'
WHEN LOWER(TRIM(tag_name)) IN ('combinatorics','组合数学','组合数学 / combinatorics','组合计数') THEN 'combinatorics'
WHEN LOWER(TRIM(tag_name)) IN ('games','博弈','game theory','博弈 / game theory','博弈论') THEN 'games'
WHEN LOWER(TRIM(tag_name)) IN ('dsu','并查集','并查集 / dsu','disjoint set union') THEN 'dsu'
WHEN LOWER(TRIM(tag_name)) IN ('interactive','交互','交互 / interactive','交互题') THEN 'interactive'
WHEN LOWER(TRIM(tag_name)) IN ('probabilities','概率','probability','概率 / probability','概率论') THEN 'probabilities'
WHEN LOWER(TRIM(tag_name)) IN ('geometry','计算几何','计算几何 / geometry','几何') THEN 'geometry'
WHEN LOWER(TRIM(tag_name)) IN ('divide and conquer','分治','分治 / divide and conquer') THEN 'divide and conquer'
WHEN LOWER(TRIM(tag_name)) IN ('2-sat','二元可满足性','二元可满足性 / 2-sat','2sat') THEN '2-sat'
WHEN LOWER(TRIM(tag_name)) IN ('string suffix structures','字符串后缀结构','字符串后缀结构 / string suffix structures','后缀结构') THEN 'string suffix structures'
WHEN LOWER(TRIM(tag_name)) IN ('matrices','矩阵','矩阵 / matrices','matrix') THEN 'matrices'
WHEN LOWER(TRIM(tag_name)) IN ('ternary search','三分查找','三分查找 / ternary search','三分') THEN 'ternary search'
WHEN LOWER(TRIM(tag_name)) IN ('hashing','哈希','哈希 / hashing','hash') THEN 'hashing'
WHEN LOWER(TRIM(tag_name)) IN ('graph matchings','图匹配','graph matching','图匹配 / graph matching') THEN 'graph matchings'
WHEN LOWER(TRIM(tag_name)) IN ('shortest paths','最短路','最短路 / shortest paths','最短路径') THEN 'shortest paths'
WHEN LOWER(TRIM(tag_name)) IN ('schedules','调度','scheduling','调度 / scheduling') THEN 'schedules'
WHEN LOWER(TRIM(tag_name)) IN ('communication','通信','通信 / communication') THEN 'communication'
WHEN LOWER(TRIM(tag_name)) IN ('flows','网络流','network flow','网络流 / network flow') THEN 'flows'
WHEN LOWER(TRIM(tag_name)) IN ('fft','快速傅里叶变换','快速傅里叶变换 / fft') THEN 'fft'
WHEN LOWER(TRIM(tag_name)) IN ('chinese remainder theorem','中国剩余定理','crt','中国剩余定理 / crt') THEN 'chinese remainder theorem'
WHEN LOWER(TRIM(tag_name)) IN ('meet-in-the-middle','折半搜索','折半搜索 / meet-in-the-middle') THEN 'meet-in-the-middle'
WHEN LOWER(TRIM(tag_name)) IN ('expression parsing','表达式解析','表达式解析 / expression parsing') THEN 'expression parsing'
ELSE LOWER(TRIM(tag_name)) END AS canonical_key,
CASE
WHEN LOWER(TRIM(tag_name)) IN ('dp','动态规划','dynamic programming','动态规划 / dynamic programming') THEN '动态规划 / Dynamic Programming'
WHEN LOWER(TRIM(tag_name)) IN ('greedy','贪心','贪心 / greedy','贪心算法') THEN '贪心 / Greedy'
WHEN LOWER(TRIM(tag_name)) IN ('math','数学','mathematics','数学 / mathematics') THEN '数学 / Mathematics'
WHEN LOWER(TRIM(tag_name)) IN ('graphs','图论','graph theory','图论 / graph theory') THEN '图论 / Graph Theory'
WHEN LOWER(TRIM(tag_name)) IN ('strings','字符串','字符串 / strings','string') THEN '字符串 / Strings'
WHEN LOWER(TRIM(tag_name)) IN ('data structures','数据结构','数据结构 / data structures') THEN '数据结构 / Data Structures'
WHEN LOWER(TRIM(tag_name)) IN ('binary search','二分查找','二分查找 / binary search','二分') THEN '二分查找 / Binary Search'
WHEN LOWER(TRIM(tag_name)) IN ('dfs and similar','深度优先搜索及相关','深度优先搜索及相关 / dfs and similar','深度优先搜索','dfs') THEN '深度优先搜索及相关 / DFS and Similar'
WHEN LOWER(TRIM(tag_name)) IN ('bfs','广度优先搜索','广度优先搜索 / bfs') THEN '广度优先搜索 / BFS'
WHEN LOWER(TRIM(tag_name)) IN ('sortings','排序','sorting','排序 / sorting') THEN '排序 / Sorting'
WHEN LOWER(TRIM(tag_name)) IN ('implementation','模拟与实现','模拟与实现 / implementation','模拟','实现') THEN '模拟与实现 / Implementation'
WHEN LOWER(TRIM(tag_name)) IN ('constructive algorithms','构造','构造 / constructive algorithms','构造算法') THEN '构造 / Constructive Algorithms'
WHEN LOWER(TRIM(tag_name)) IN ('brute force','暴力枚举','暴力枚举 / brute force','暴力','枚举') THEN '暴力枚举 / Brute Force'
WHEN LOWER(TRIM(tag_name)) IN ('number theory','数论','数论 / number theory') THEN '数论 / Number Theory'
WHEN LOWER(TRIM(tag_name)) IN ('bitmasks','位运算与状态压缩','位运算与状态压缩 / bitmasks','位运算','状态压缩') THEN '位运算与状态压缩 / Bitmasks'
WHEN LOWER(TRIM(tag_name)) IN ('two pointers','双指针','双指针 / two pointers') THEN '双指针 / Two Pointers'
WHEN LOWER(TRIM(tag_name)) IN ('trees','树','树 / trees','树结构') THEN '树 / Trees'
WHEN LOWER(TRIM(tag_name)) IN ('combinatorics','组合数学','组合数学 / combinatorics','组合计数') THEN '组合数学 / Combinatorics'
WHEN LOWER(TRIM(tag_name)) IN ('games','博弈','game theory','博弈 / game theory','博弈论') THEN '博弈 / Game Theory'
WHEN LOWER(TRIM(tag_name)) IN ('dsu','并查集','并查集 / dsu','disjoint set union') THEN '并查集 / DSU'
WHEN LOWER(TRIM(tag_name)) IN ('interactive','交互','交互 / interactive','交互题') THEN '交互 / Interactive'
WHEN LOWER(TRIM(tag_name)) IN ('probabilities','概率','probability','概率 / probability','概率论') THEN '概率 / Probability'
WHEN LOWER(TRIM(tag_name)) IN ('geometry','计算几何','计算几何 / geometry','几何') THEN '计算几何 / Geometry'
WHEN LOWER(TRIM(tag_name)) IN ('divide and conquer','分治','分治 / divide and conquer') THEN '分治 / Divide and Conquer'
WHEN LOWER(TRIM(tag_name)) IN ('2-sat','二元可满足性','二元可满足性 / 2-sat','2sat') THEN '二元可满足性 / 2-SAT'
WHEN LOWER(TRIM(tag_name)) IN ('string suffix structures','字符串后缀结构','字符串后缀结构 / string suffix structures','后缀结构') THEN '字符串后缀结构 / String Suffix Structures'
WHEN LOWER(TRIM(tag_name)) IN ('matrices','矩阵','矩阵 / matrices','matrix') THEN '矩阵 / Matrices'
WHEN LOWER(TRIM(tag_name)) IN ('ternary search','三分查找','三分查找 / ternary search','三分') THEN '三分查找 / Ternary Search'
WHEN LOWER(TRIM(tag_name)) IN ('hashing','哈希','哈希 / hashing','hash') THEN '哈希 / Hashing'
WHEN LOWER(TRIM(tag_name)) IN ('graph matchings','图匹配','graph matching','图匹配 / graph matching') THEN '图匹配 / Graph Matching'
WHEN LOWER(TRIM(tag_name)) IN ('shortest paths','最短路','最短路 / shortest paths','最短路径') THEN '最短路 / Shortest Paths'
WHEN LOWER(TRIM(tag_name)) IN ('schedules','调度','scheduling','调度 / scheduling') THEN '调度 / Scheduling'
WHEN LOWER(TRIM(tag_name)) IN ('communication','通信','通信 / communication') THEN '通信 / Communication'
WHEN LOWER(TRIM(tag_name)) IN ('flows','网络流','network flow','网络流 / network flow') THEN '网络流 / Network Flow'
WHEN LOWER(TRIM(tag_name)) IN ('fft','快速傅里叶变换','快速傅里叶变换 / fft') THEN '快速傅里叶变换 / FFT'
WHEN LOWER(TRIM(tag_name)) IN ('chinese remainder theorem','中国剩余定理','crt','中国剩余定理 / crt') THEN '中国剩余定理 / CRT'
WHEN LOWER(TRIM(tag_name)) IN ('meet-in-the-middle','折半搜索','折半搜索 / meet-in-the-middle') THEN '折半搜索 / Meet-in-the-Middle'
WHEN LOWER(TRIM(tag_name)) IN ('expression parsing','表达式解析','表达式解析 / expression parsing') THEN '表达式解析 / Expression Parsing'
ELSE TRIM(tag_name) END AS display_name FROM tag) definitions;
INSERT IGNORE INTO problem_tag(problem_id,tag_id)
SELECT pt.problem_id,m.keep_id FROM problem_tag pt JOIN tag_merge_map m ON m.old_id=pt.tag_id;
DELETE pt FROM problem_tag pt JOIN tag_merge_map m ON m.old_id=pt.tag_id WHERE m.old_id<>m.keep_id;
DELETE t FROM tag t JOIN tag_merge_map m ON m.old_id=t.tag_id WHERE m.old_id<>m.keep_id;
UPDATE tag t JOIN tag_merge_map m ON m.old_id=t.tag_id AND m.keep_id=t.tag_id
SET t.tag_name=m.canonical_key,t.display_name=m.display_name;
DROP TEMPORARY TABLE tag_merge_map;
COMMIT;
