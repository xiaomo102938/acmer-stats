# 个人刷题数据分析网站（acmer-stats）

> 《互联网应用服务开发与数据库实践》期末大作业
> 学号：241240027　姓名：汪林辰

## 项目简介

面向 ACM 选手的个人刷题数据分析网站。集中记录在 Codeforces、洛谷、AtCoder、LeetCode 等平台的刷题数据，提供多维度统计分析与可视化展示：各平台刷题量、题型掌握度（擅长/薄弱判定）、难度分布、月度趋势、连续打卡等。

特色功能：绑定各平台账号后，进入网站自动登录对应平台并同步最新刷题数据（账号密码加密存储）。

## 技术栈（拟定）

- 前端：Vue 3 + ECharts
- 后端：Node.js（Express）
- 数据库：MySQL 8.0
- 数据采集：Python + Playwright（参考 GitHub 开源同类项目）
- 版本控制：Git + GitHub

## 目录结构

```
acmer-stats/
├── README.md            # 项目说明
├── .gitignore           # Git 忽略规则
├── docs/                # 文档：需求分析、系统设计报告
├── src/
│   ├── frontend/        # 前端代码
│   └── backend/         # 后端代码（含数据采集器）
├── sql/                 # 数据库脚本（建库、视图、存储过程、触发器）
└── tests/               # 测试
```

## 提交信息规范（Conventional Commits）

格式：`前缀: 简要说明`

| 前缀 | 用途 |
|------|------|
| feat | 新功能 |
| fix | 修复缺陷 |
| docs | 文档变更 |
| chore | 初始化、构建、杂项 |
| style | 代码格式调整 |
| refactor | 重构 |
| test | 测试相关 |

## 当前进度

- [x] 需求分析报告
- [x] 数据库设计（E-R 图、关系模式）
- [x] 数据库实现（表、视图、存储过程、触发器）
- [x] 系统设计报告初稿
- [ ] 前端页面开发
- [ ] 后端接口开发
- [ ] 平台数据自动同步

## 数据库更新校验

2026-11-03：新增 trg_record_check_update 触发器，修改刷题记录时拒绝未来日期和 1 至 999 以外的提交次数。现有本机数据库已应用并通过事务回滚测试，原记录不变。

已有数据库只需执行一次 sql/migrations/001_validate_record_updates.sql，不要重新执行全量初始化脚本。新建数据库使用 sql/acmer_stats.sql，已包含本次修复。

回归测试位于 tests/record_update_validation.sql，要求至少一条已有记录。使用 mysql --default-character-set=utf8mb4 --force acmer_stats 执行，预期三条 ERROR 1644 (45000) 和四项通过标记，无 FAIL。测试最后回滚全部数据修改。密码通过环境配置提供，不写入仓库。

