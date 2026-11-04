# 平台 Rating 与练习统计

详细分析中的“各平台练习情况”分别显示去重通过题数、尝试题数与绑定账号的个人竞赛 Rating，不展示通过比例或进度条。尝试题数包含通过题目，不等于提交次数。

## 分数来源

- Codeforces：官方 user.info 的 rating。
- AtCoder：官方比赛历史中最新一次已评级 Algorithm 比赛的 NewRating。
- 牛客：公开竞赛评级历史中时间最新的 rating，使用数字 UID 定位。
- QOJ：个人主页中与目标用户名匹配的 uoj-username 的 data-rating，沿用本机保存的 Cookie 与 QOJ 网络配置；不把通过题数当 Rating。
- 力扣中国：公开 userContestRanking；没有公开结果时明确标注，不填零。
- 洛谷：暂未接入竞赛 Rating，不用洛谷估值替代。

各平台使用自身分制，不能直接横向比较，也不与题目 CF 估分或题型能力参考混用。多账号逐个展示。

## 缓存与部署

已有数据库应用 sql/migrations/010_account_rating.sql；全量建库脚本已包含该表。本机已完成迁移。

GET /api/ratings 只读取缓存，不访问上游。POST /api/ratings/refresh 由按钮触发，最多并发两个账号，重复刷新返回忙碌状态；账号同步完成后也更新该账号 Rating。失败保留已有分数及其成功更新时间，并标注缓存状态。Cookie 仅在后端解密使用，不返回接口或写入 Git。

2026-11-04 本机实测：CF 1720、AtCoder Algorithm 158、牛客 1905、QOJ ai_nuo 1800。另一个 QOJ 账号会话失败；力扣未返回公开分数。缺失不作为零分。

## 验证

node --test tests/ratings.test.js 检查缺失值、有效零分、最新比赛及 QOJ 目标用户属性解析，防止误取其他账号或 AC 数量。

node --env-file=.env tests/ratings-database.mjs 使用临时表验证 MySQL 失败保留缓存及有效零分更新，不更改正式缓存。Vite 生产构建通过。
