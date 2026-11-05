-- ============================================================================
-- 大作业题目：个人刷题数据分析网站
-- 数据库实现脚本（MySQL 8.0 / InnoDB / utf8mb4）
-- 姓名：汪林辰    学号：241240027
-- 说明：本脚本与需求分析报告中的数据需求、ER 图及业务规则一一对应：
--   · 6 张表：用户、平台、题目、题型标签、题目标签、刷题记录
--   · 5 个视图：平台统计、题型统计（擅长/薄弱判定）、难度统计、月度趋势、个人总览
--   · 3 个存储过程：录入刷题记录、题型排行、连续打卡天数
--   · 2 个触发器：刷题记录数据校验、同一题目重复录入拦截
-- 通过率 = 通过题数 / 刷题总数 × 100%，保留 1 位小数；
-- 擅长题型：刷题数 ≥ 30 且通过率 ≥ 80%；薄弱题型：刷题数 ≥ 20 且通过率 < 60%；
-- 刷题数 < 20 视为样本不足，不参与判定；同一题目只记一条记录，提交次数累加。
-- ============================================================================

-- <<<sec_db>>>
-- ----------------------------------------------------------------------------
-- 0. 创建数据库（utf8mb4 完整支持中文与表情符号）
-- ----------------------------------------------------------------------------
DROP DATABASE IF EXISTS acmer_stats;
CREATE DATABASE acmer_stats
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
USE acmer_stats;

-- <<<sec_t_user>>>
-- ----------------------------------------------------------------------------
-- 1. 用户表 user：保存博主（网站使用者）的基本信息
-- ----------------------------------------------------------------------------
CREATE TABLE `user` (
  user_id    CHAR(36)     NOT NULL                COMMENT '用户编号（UUID 主键）',
  user_name  VARCHAR(50)  NOT NULL                COMMENT '姓名',
  bio        VARCHAR(500) DEFAULT NULL            COMMENT '个人简介',
  avatar     VARCHAR(255) DEFAULT NULL            COMMENT '头像图片路径',
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户表';

-- <<<sec_t_platform>>>
-- ----------------------------------------------------------------------------
-- 2. 平台表 platform：刷题网站（Codeforces、洛谷、AtCoder、LeetCode 等）
-- ----------------------------------------------------------------------------
CREATE TABLE `platform` (
  platform_id   CHAR(36)     NOT NULL             COMMENT '平台编号（UUID 主键）',
  platform_name VARCHAR(50)  NOT NULL             COMMENT '平台名称',
  platform_url  VARCHAR(255) DEFAULT NULL         COMMENT '平台网址',
  PRIMARY KEY (platform_id),
  UNIQUE KEY uk_platform_name (platform_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='刷题平台表';

-- <<<sec_t_problem>>>
-- ----------------------------------------------------------------------------
-- 3. 题目表 problem：每道题归属一个平台（平台 1:n 题目）
-- ----------------------------------------------------------------------------
CREATE TABLE `problem` (
  problem_id   CHAR(36)                        NOT NULL COMMENT '题目编号（UUID 主键）',
  problem_name VARCHAR(100)                    NOT NULL COMMENT '题目名称',
  difficulty   ENUM('入门','普及','提高','省选') NOT NULL DEFAULT '普及' COMMENT '难度',
  platform_id  CHAR(36)                        NOT NULL COMMENT '所属平台编号（外键）',
  PRIMARY KEY (problem_id),
  UNIQUE KEY uk_platform_problem (platform_id, problem_name),
  CONSTRAINT fk_problem_platform FOREIGN KEY (platform_id)
    REFERENCES platform (platform_id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='题目表';

-- <<<sec_t_tag>>>
-- ----------------------------------------------------------------------------
-- 4. 题型标签表 tag：动态规划、图论、贪心等题型分类
-- ----------------------------------------------------------------------------
CREATE TABLE `tag` (
  tag_id   CHAR(36)    NOT NULL                   COMMENT '标签编号（UUID 主键）',
  tag_name VARCHAR(30) NOT NULL                   COMMENT '标签名称',
  PRIMARY KEY (tag_id),
  UNIQUE KEY uk_tag_name (tag_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='题型标签表';

-- <<<sec_t_pt>>>
-- ----------------------------------------------------------------------------
-- 5. 题目标签表 problem_tag：题目与标签的 n:m 联系（联合主键）
-- ----------------------------------------------------------------------------
CREATE TABLE `problem_tag` (
  problem_id CHAR(36) NOT NULL                    COMMENT '题目编号（外键）',
  tag_id     CHAR(36) NOT NULL                    COMMENT '标签编号（外键）',
  PRIMARY KEY (problem_id, tag_id),
  CONSTRAINT fk_pt_problem FOREIGN KEY (problem_id)
    REFERENCES problem (problem_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_pt_tag FOREIGN KEY (tag_id)
    REFERENCES tag (tag_id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='题目-标签联系表';

-- <<<sec_t_record>>>
-- ----------------------------------------------------------------------------
-- 6. 刷题记录表 record：用户 1:n 记录、题目 1:n 记录
--    同一用户的同一题目只记一条记录（唯一约束），多次提交只累加提交次数
-- ----------------------------------------------------------------------------
CREATE TABLE `record` (
  record_id    CHAR(36)  NOT NULL                 COMMENT '记录编号（UUID 主键）',
  passed       TINYINT(1) NOT NULL DEFAULT 0      COMMENT '是否通过：0 未通过，1 已通过',
  submit_count INT       NOT NULL DEFAULT 1       COMMENT '提交次数（1~999）',
  solve_date   DATE      NOT NULL                 COMMENT '刷题日期',
  user_id      CHAR(36)  NOT NULL                 COMMENT '用户编号（外键）',
  problem_id   CHAR(36)  NOT NULL                 COMMENT '题目编号（外键）',
  PRIMARY KEY (record_id),
  UNIQUE KEY uk_user_problem (user_id, problem_id),
  CONSTRAINT fk_record_user FOREIGN KEY (user_id)
    REFERENCES `user` (user_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_record_problem FOREIGN KEY (problem_id)
    REFERENCES problem (problem_id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='刷题记录表';

-- <<<sec_t_acct>>>
-- ----------------------------------------------------------------------------
-- 7. 平台账号表 platform_account：保存各刷题平台的登录账号（用于自动同步）
--    用户 1:n 平台账号、平台 1:n 平台账号；密码经 AES 加密后以二进制存储
-- ----------------------------------------------------------------------------
CREATE TABLE `platform_account` (
  account_id  CHAR(36)      NOT NULL              COMMENT '账号编号（UUID 主键）',
  user_id     CHAR(36)      NOT NULL              COMMENT '用户编号（外键）',
  platform_id CHAR(36)      NOT NULL              COMMENT '平台编号（外键）',
  login_name  VARCHAR(100)  NOT NULL              COMMENT '平台登录账号',
  login_pwd   VARBINARY(255) NOT NULL             COMMENT '平台登录密码（AES 加密存储）',
  last_sync   DATETIME      DEFAULT NULL          COMMENT '最近同步时间',
  PRIMARY KEY (account_id),
  UNIQUE KEY uk_user_platform (user_id, platform_id),
  CONSTRAINT fk_acct_user FOREIGN KEY (user_id)
    REFERENCES `user` (user_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT fk_acct_platform FOREIGN KEY (platform_id)
    REFERENCES platform (platform_id)
    ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='平台账号表';

-- <<<sec_v_platform>>>
-- ----------------------------------------------------------------------------
-- 视图 1：v_platform_stats 各平台刷题统计
-- 统计每个平台刷了多少道题、通过几道、通过率（百分比，保留 1 位小数）
-- ----------------------------------------------------------------------------
CREATE VIEW v_platform_stats AS
SELECT
  p.platform_id                                AS platform_id,
  p.platform_name                              AS platform_name,
  COUNT(r.record_id)                           AS total_count,
  COALESCE(SUM(r.passed), 0)                   AS passed_count,
  ROUND(COALESCE(SUM(r.passed), 0) / COUNT(r.record_id) * 100, 1) AS pass_rate
FROM platform p
JOIN problem pr ON pr.platform_id = p.platform_id
JOIN `record` r ON r.problem_id = pr.problem_id
GROUP BY p.platform_id, p.platform_name;

-- <<<sec_v_tag>>>
-- ----------------------------------------------------------------------------
-- 视图 2：v_tag_stats 各题型刷题统计 + 掌握度判定
-- 掌握度判定规则（对应需求文档 3.1 业务规则）：
--   刷题数 ≥ 30 且通过率 ≥ 80%  → 擅长
--   刷题数 ≥ 20 且通过率 <  60%  → 薄弱
--   刷题数 <  20                → 样本不足（不参与判定）
--   其余                        → 正常
-- ----------------------------------------------------------------------------
CREATE VIEW v_tag_stats AS
SELECT
  t.tag_id                                     AS tag_id,
  t.tag_name                                   AS tag_name,
  COUNT(r.record_id)                           AS total_count,
  COALESCE(SUM(r.passed), 0)                   AS passed_count,
  ROUND(COALESCE(SUM(r.passed), 0) / COUNT(r.record_id) * 100, 1) AS pass_rate,
  CASE
    WHEN COUNT(r.record_id) >= 30
         AND COALESCE(SUM(r.passed), 0) / COUNT(r.record_id) * 100 >= 80
      THEN '擅长'
    WHEN COUNT(r.record_id) >= 20
         AND COALESCE(SUM(r.passed), 0) / COUNT(r.record_id) * 100 < 60
      THEN '薄弱'
    WHEN COUNT(r.record_id) < 20
      THEN '样本不足'
    ELSE '正常'
  END                                          AS mastery
FROM tag t
JOIN problem_tag pt ON pt.tag_id = t.tag_id
JOIN problem pr   ON pr.problem_id = pt.problem_id
JOIN `record` r   ON r.problem_id = pr.problem_id
GROUP BY t.tag_id, t.tag_name;

-- <<<sec_v_diff>>>
-- ----------------------------------------------------------------------------
-- 视图 3：v_difficulty_stats 按难度统计刷题情况
-- ----------------------------------------------------------------------------
CREATE VIEW v_difficulty_stats AS
SELECT
  pr.difficulty                                AS difficulty,
  COUNT(r.record_id)                           AS total_count,
  COALESCE(SUM(r.passed), 0)                   AS passed_count,
  ROUND(COALESCE(SUM(r.passed), 0) / COUNT(r.record_id) * 100, 1) AS pass_rate
FROM problem pr
JOIN `record` r ON r.problem_id = pr.problem_id
GROUP BY pr.difficulty;

-- <<<sec_v_month>>>
-- ----------------------------------------------------------------------------
-- 视图 4：v_monthly_trend 月度刷题趋势（按月汇总刷题数与通过率）
-- ----------------------------------------------------------------------------
CREATE VIEW v_monthly_trend AS
SELECT
  DATE_FORMAT(r.solve_date, '%Y-%m')           AS solve_month,
  COUNT(r.record_id)                           AS total_count,
  COALESCE(SUM(r.passed), 0)                   AS passed_count,
  ROUND(COALESCE(SUM(r.passed), 0) / COUNT(r.record_id) * 100, 1) AS pass_rate
FROM `record` r
GROUP BY DATE_FORMAT(r.solve_date, '%Y-%m')
ORDER BY solve_month;

-- <<<sec_v_overview>>>
-- ----------------------------------------------------------------------------
-- 视图 5：v_user_overview 个人刷题总览
-- 总刷题数、总通过数、总通过率、覆盖平台数、覆盖题型数、首次/最近刷题日期
-- ----------------------------------------------------------------------------
CREATE VIEW v_user_overview AS
SELECT
  u.user_id                                    AS user_id,
  u.user_name                                  AS user_name,
  COUNT(DISTINCT r.record_id)                  AS total_problems,
  COUNT(DISTINCT IF(r.passed = 1, r.record_id, NULL)) AS passed_problems,
  ROUND(COUNT(DISTINCT IF(r.passed = 1, r.record_id, NULL))
        / COUNT(DISTINCT r.record_id) * 100, 1) AS pass_rate,
  COUNT(DISTINCT pr.platform_id)               AS platform_count,
  COUNT(DISTINCT pt.tag_id)                    AS tag_count,
  MIN(r.solve_date)                            AS first_solve_date,
  MAX(r.solve_date)                            AS last_solve_date
FROM `user` u
LEFT JOIN `record` r    ON r.user_id = u.user_id
LEFT JOIN problem pr    ON pr.problem_id = r.problem_id
LEFT JOIN problem_tag pt ON pt.problem_id = pr.problem_id
GROUP BY u.user_id, u.user_name;

-- <<<sec_p_add>>>
-- ----------------------------------------------------------------------------
-- 存储过程 1：sp_add_record 录入一条刷题记录
-- 功能：录入时若平台 / 题目 / 标签尚不存在则自动创建，并自动维护
--       题目-标签关联；同一用户的同一题目只记一条记录，重复录入时
--       累加提交次数、更新通过状态与最近刷题日期。
-- 参数：用户名、平台名、平台网址、题目名、难度、标签（逗号分隔）、
--       是否通过(0/1)、本次提交次数、刷题日期
-- ----------------------------------------------------------------------------
DELIMITER //
CREATE PROCEDURE sp_add_record(
  IN p_user_name     VARCHAR(50),
  IN p_platform_name VARCHAR(50),
  IN p_platform_url  VARCHAR(255),
  IN p_problem_name  VARCHAR(100),
  IN p_difficulty    VARCHAR(10),
  IN p_tags          VARCHAR(255),
  IN p_passed        TINYINT,
  IN p_submit_count  INT,
  IN p_solve_date    DATE
)
BEGIN
  DECLARE v_user_id     CHAR(36);
  DECLARE v_platform_id CHAR(36);
  DECLARE v_problem_id  CHAR(36);
  DECLARE v_tag_id      CHAR(36);
  DECLARE v_tag_name    VARCHAR(30);
  DECLARE v_pos         INT DEFAULT 0;
  DECLARE v_rest        VARCHAR(255);

  /* 1. 用户不存在则自动创建（个人网站通常只有一名用户） */
  SELECT user_id INTO v_user_id FROM `user`
   WHERE user_name = p_user_name LIMIT 1;
  IF v_user_id IS NULL THEN
    SET v_user_id = UUID();
    INSERT INTO `user` (user_id, user_name) VALUES (v_user_id, p_user_name);
  END IF;

  /* 2. 平台不存在则自动创建 */
  SELECT platform_id INTO v_platform_id FROM platform
   WHERE platform_name = p_platform_name LIMIT 1;
  IF v_platform_id IS NULL THEN
    SET v_platform_id = UUID();
    INSERT INTO platform (platform_id, platform_name, platform_url)
    VALUES (v_platform_id, p_platform_name, p_platform_url);
  END IF;

  /* 3. 题目不存在则自动创建（同平台下按题目名判重） */
  SELECT problem_id INTO v_problem_id FROM problem
   WHERE problem_name = p_problem_name AND platform_id = v_platform_id LIMIT 1;
  IF v_problem_id IS NULL THEN
    SET v_problem_id = UUID();
    INSERT INTO problem (problem_id, problem_name, difficulty, platform_id)
    VALUES (v_problem_id, p_problem_name, p_difficulty, v_platform_id);
  END IF;

  /* 4. 逐个处理逗号分隔的标签：不存在则创建，并维护题目-标签关联 */
  SET v_rest = p_tags;
  WHILE v_rest IS NOT NULL AND v_rest <> '' DO
    SET v_pos = LOCATE(',', v_rest);
    IF v_pos > 0 THEN
      SET v_tag_name = TRIM(SUBSTRING(v_rest, 1, v_pos - 1));
      SET v_rest = SUBSTRING(v_rest, v_pos + 1);
    ELSE
      SET v_tag_name = TRIM(v_rest);
      SET v_rest = NULL;
    END IF;

    IF v_tag_name IS NOT NULL AND v_tag_name <> '' THEN
      SELECT tag_id INTO v_tag_id FROM tag WHERE tag_name = v_tag_name LIMIT 1;
      IF v_tag_id IS NULL THEN
        SET v_tag_id = UUID();
        INSERT INTO tag (tag_id, tag_name) VALUES (v_tag_id, v_tag_name);
      END IF;
      INSERT IGNORE INTO problem_tag (problem_id, tag_id)
      VALUES (v_problem_id, v_tag_id);
    END IF;
  END WHILE;

  /* 5. 写入刷题记录：同一题目只记一条，重复刷题累加提交次数 */
  IF EXISTS (SELECT 1 FROM `record`
             WHERE user_id = v_user_id AND problem_id = v_problem_id) THEN
    UPDATE `record`
       SET submit_count = LEAST(submit_count + p_submit_count, 999),
           passed       = p_passed,
           solve_date   = GREATEST(solve_date, p_solve_date)
     WHERE user_id = v_user_id AND problem_id = v_problem_id;
  ELSE
    INSERT INTO `record`
      (record_id, passed, submit_count, solve_date, user_id, problem_id)
    VALUES
      (UUID(), p_passed, p_submit_count, p_solve_date, v_user_id, v_problem_id);
  END IF;
END //
DELIMITER ;

-- <<<sec_p_rank>>>
-- ----------------------------------------------------------------------------
-- 存储过程 2：sp_tag_rank 题型刷题排行
-- 功能：按刷题数从高到低输出各题型的刷题数、通过数、通过率与掌握度，
--       对应需求文档"哪种题刷得最多、最擅长什么题"的统计需求。
-- ----------------------------------------------------------------------------
DELIMITER //
CREATE PROCEDURE sp_tag_rank()
BEGIN
  SELECT tag_name, total_count, passed_count, pass_rate, mastery
    FROM v_tag_stats
   ORDER BY total_count DESC, pass_rate DESC;
END //
DELIMITER ;

-- <<<sec_p_streak>>>
-- ----------------------------------------------------------------------------
-- 存储过程 3：sp_streak_days 计算连续打卡天数
-- 功能：从最近一次刷题日期向前逐日检查，统计连续不间断的打卡天数，
--       结果通过 OUT 参数返回（对应需求文档"连续打卡"统计口径）。
-- ----------------------------------------------------------------------------
DELIMITER //
CREATE PROCEDURE sp_streak_days(
  IN  p_user_id CHAR(36),
  OUT p_streak  INT
)
BEGIN
  DECLARE v_date DATE;
  DECLARE v_done INT DEFAULT 0;

  /* 最近一次刷题日期作为起点 */
  SELECT MAX(solve_date) INTO v_date FROM `record` WHERE user_id = p_user_id;
  SET p_streak = 0;

  /* 逐日向前回退，遇到没有刷题记录的日期即停止 */
  WHILE v_date IS NOT NULL AND v_done = 0 DO
    IF EXISTS (SELECT 1 FROM `record`
               WHERE user_id = p_user_id AND solve_date = v_date) THEN
      SET p_streak = p_streak + 1;
      SET v_date = DATE_SUB(v_date, INTERVAL 1 DAY);
    ELSE
      SET v_done = 1;
    END IF;
  END WHILE;
END //
DELIMITER ;

-- <<<sec_tr_check>>>
-- ----------------------------------------------------------------------------
-- 触发器 1：trg_record_check 刷题记录数据校验（BEFORE INSERT）
-- 功能：写入刷题记录前自动校验——刷题日期不能晚于当天，
--       提交次数必须在 1~999 之间；不满足则抛出错误并拒绝写入。
-- ----------------------------------------------------------------------------
DELIMITER //
CREATE TRIGGER trg_record_check
BEFORE INSERT ON `record`
FOR EACH ROW
BEGIN
  IF NEW.solve_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '刷题日期不能晚于今天';
  END IF;
  IF NEW.submit_count < 1 OR NEW.submit_count > 999 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '提交次数必须在 1~999 之间';
  END IF;
END //
DELIMITER ;

-- <<<sec_tr_dup>>>
-- ----------------------------------------------------------------------------
-- 触发器 2：trg_record_dup 同一题目重复录入拦截（BEFORE INSERT）
-- 功能：落实"同一题目多次提交只记一条记录"的业务规则——直接 INSERT
--       重复题目时给出中文错误提示（底层另有 uk_user_problem 唯一约束
--       兜底），重复刷题应调用 sp_add_record 累加提交次数。
-- ----------------------------------------------------------------------------
DELIMITER //
CREATE TRIGGER trg_record_dup
BEFORE INSERT ON `record`
FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM `record`
             WHERE user_id = NEW.user_id AND problem_id = NEW.problem_id) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '同一题目只记一条刷题记录，请调用 sp_add_record 累加提交次数';
  END IF;
END //
DELIMITER ;

-- <<<sec_data>>>
-- ----------------------------------------------------------------------------
-- 示例数据：博主汪林辰 2026 年 9 ~ 10 月的刷题记录
-- ----------------------------------------------------------------------------
INSERT INTO `user` (user_id, user_name, bio) VALUES
('a0000000-0000-4000-8000-000000000001', '汪林辰', 'ACM 爱好者，主攻动态规划与图论');

INSERT INTO platform (platform_id, platform_name, platform_url) VALUES
('b0000000-0000-4000-8000-000000000001', 'Codeforces', 'https://codeforces.com'),
('b0000000-0000-4000-8000-000000000002', '洛谷',       'https://www.luogu.com.cn'),
('b0000000-0000-4000-8000-000000000003', 'AtCoder',    'https://atcoder.jp'),
('b0000000-0000-4000-8000-000000000004', 'LeetCode',   'https://leetcode.cn');

INSERT INTO tag (tag_id, tag_name) VALUES
('c0000000-0000-4000-8000-000000000001', '动态规划'),
('c0000000-0000-4000-8000-000000000002', '图论'),
('c0000000-0000-4000-8000-000000000003', '数据结构'),
('c0000000-0000-4000-8000-000000000004', '贪心'),
('c0000000-0000-4000-8000-000000000005', '数学'),
('c0000000-0000-4000-8000-000000000006', '字符串'),
('c0000000-0000-4000-8000-000000000007', '二分');

INSERT INTO problem (problem_id, problem_name, difficulty, platform_id) VALUES
('d0000000-0000-4000-8000-000000000001', 'Codeforces 1850D Balanced Round',      '普及', 'b0000000-0000-4000-8000-000000000001'),
('d0000000-0000-4000-8000-000000000002', 'Codeforces 1834C Game with Reversing', '普及', 'b0000000-0000-4000-8000-000000000001'),
('d0000000-0000-4000-8000-000000000003', 'Codeforces 1742E Scuza',               '提高', 'b0000000-0000-4000-8000-000000000001'),
('d0000000-0000-4000-8000-000000000004', '洛谷 P1048 采药',                       '入门', 'b0000000-0000-4000-8000-000000000002'),
('d0000000-0000-4000-8000-000000000005', '洛谷 P1095 守望者的逃离',               '普及', 'b0000000-0000-4000-8000-000000000002'),
('d0000000-0000-4000-8000-000000000006', '洛谷 P3367 【模板】并查集',             '普及', 'b0000000-0000-4000-8000-000000000002'),
('d0000000-0000-4000-8000-000000000007', '洛谷 P3371 【模板】单源最短路径',       '提高', 'b0000000-0000-4000-8000-000000000002'),
('d0000000-0000-4000-8000-000000000008', '洛谷 P1020 导弹拦截',                   '提高', 'b0000000-0000-4000-8000-000000000002'),
('d0000000-0000-4000-8000-000000000009', 'AtCoder ABC311C Find it!',             '普及', 'b0000000-0000-4000-8000-000000000003'),
('d0000000-0000-4000-8000-00000000000a', 'AtCoder ABC322D Polyomino',            '提高', 'b0000000-0000-4000-8000-000000000003'),
('d0000000-0000-4000-8000-00000000000b', 'AtCoder ABC308C Standings',            '普及', 'b0000000-0000-4000-8000-000000000003'),
('d0000000-0000-4000-8000-00000000000c', 'LeetCode 300 最长递增子序列',           '提高', 'b0000000-0000-4000-8000-000000000004'),
('d0000000-0000-4000-8000-00000000000d', 'LeetCode 72 编辑距离',                  '提高', 'b0000000-0000-4000-8000-000000000004'),
('d0000000-0000-4000-8000-00000000000e', 'LeetCode 151 反转字符串中的单词',       '普及', 'b0000000-0000-4000-8000-000000000004');

INSERT INTO problem_tag (problem_id, tag_id) VALUES
('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000004'),
('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000007'),
('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000004'),
('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000005'),
('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000005'),
('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000007'),
('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001'),
('d0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001'),
('d0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000003'),
('d0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000002'),
('d0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000001'),
('d0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000007'),
('d0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000002'),
('d0000000-0000-4000-8000-000000000009', 'c0000000-0000-4000-8000-000000000005'),
('d0000000-0000-4000-8000-00000000000a', 'c0000000-0000-4000-8000-000000000004'),
('d0000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-000000000004'),
('d0000000-0000-4000-8000-00000000000b', 'c0000000-0000-4000-8000-000000000006'),
('d0000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000001'),
('d0000000-0000-4000-8000-00000000000c', 'c0000000-0000-4000-8000-000000000007'),
('d0000000-0000-4000-8000-00000000000d', 'c0000000-0000-4000-8000-000000000001'),
('d0000000-0000-4000-8000-00000000000d', 'c0000000-0000-4000-8000-000000000006'),
('d0000000-0000-4000-8000-00000000000e', 'c0000000-0000-4000-8000-000000000006');

INSERT INTO `record` (record_id, passed, submit_count, solve_date, user_id, problem_id) VALUES
(UUID(), 1, 3, '2026-09-08', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001'),
(UUID(), 1, 2, '2026-09-10', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002'),
(UUID(), 1, 1, '2026-09-12', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000004'),
(UUID(), 0, 4, '2026-09-15', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000005'),
(UUID(), 1, 2, '2026-09-18', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000006'),
(UUID(), 0, 5, '2026-09-21', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000007'),
(UUID(), 1, 2, '2026-09-24', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000009'),
(UUID(), 0, 3, '2026-09-27', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000a'),
(UUID(), 1, 1, '2026-09-28', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000b'),
(UUID(), 1, 2, '2026-09-30', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000c'),
(UUID(), 1, 3, '2026-10-03', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000d'),
(UUID(), 1, 1, '2026-10-04', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000e'),
(UUID(), 1, 1, '2026-10-05', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003'),
(UUID(), 1, 2, '2026-10-06', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000008');

-- <<<sec_verify>>>
-- ----------------------------------------------------------------------------
-- 运行验证：以下语句可直接执行，检验视图、存储过程与触发器是否生效
-- ----------------------------------------------------------------------------
-- 1) 各平台刷题统计
SELECT * FROM v_platform_stats;

-- 2) 各题型统计与掌握度判定（示例数据样本量 < 20，判定均为"样本不足"）
SELECT * FROM v_tag_stats ORDER BY total_count DESC;

-- 3) 题型排行存储过程
CALL sp_tag_rank();

-- 4) 连续打卡天数（示例数据最近 4 天连续打卡，应返回 4）
CALL sp_streak_days('a0000000-0000-4000-8000-000000000001', @streak);
SELECT @streak AS streak_days;

-- 5) 重复刷题：累加提交次数而不是新增记录（P1048 提交次数 1 → 3）
CALL sp_add_record('汪林辰', '洛谷', 'https://www.luogu.com.cn',
                   '洛谷 P1048 采药', '入门', '动态规划', 1, 2, '2026-10-08');
SELECT problem_name, submit_count, solve_date
  FROM `record` r JOIN problem p ON p.problem_id = r.problem_id
 WHERE p.problem_name = '洛谷 P1048 采药';

-- 6) 触发器校验：未来日期 / 非法提交次数 / 直接重复 INSERT 均会被拒绝
-- INSERT INTO `record` VALUES (UUID(), 1, 1, '2099-01-01', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001');
-- INSERT INTO `record` VALUES (UUID(), 1, 1000, '2026-10-01', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001');
-- INSERT INTO `record` VALUES (UUID(), 1, 1, '2026-10-01', 'a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001');

-- 更新路径校验，与新增路径规则保持一致。
-- Existing databases: apply once. No existing records are modified.
USE acmer_stats;
DELIMITER //
CREATE TRIGGER trg_record_check_update
BEFORE UPDATE ON `record`
FOR EACH ROW
BEGIN
  IF NEW.solve_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '刷题日期不能晚于今天';
  END IF;
  IF NEW.submit_count < 1 OR NEW.submit_count > 999 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '提交次数必须在 1~999 之间';
  END IF;
END //
DELIMITER ;


-- Add QOJ without creating any practice records; safe to reapply.
USE acmer_stats;
INSERT INTO platform (platform_id, platform_name, platform_url)
SELECT UUID(), 'QOJ', 'https://qoj.ac'
WHERE NOT EXISTS (SELECT 1 FROM platform WHERE platform_name='QOJ');

CREATE OR REPLACE VIEW v_platform_stats AS
SELECT p.platform_id, p.platform_name,
       COUNT(r.record_id) AS total_count,
       COALESCE(SUM(r.passed),0) AS passed_count,
       ROUND(COALESCE(SUM(r.passed),0) / NULLIF(COUNT(r.record_id),0) * 100,1) AS pass_rate
FROM platform p
LEFT JOIN problem pr ON pr.platform_id=p.platform_id
LEFT JOIN `record` r ON r.problem_id=pr.problem_id
GROUP BY p.platform_id,p.platform_name;

-- Account management and submission-level sync migration
USE acmer_stats;
ALTER TABLE platform_account DROP INDEX uk_user_platform,
 ADD UNIQUE KEY uk_user_platform_login(user_id,platform_id,login_name),
 MODIFY login_pwd VARBINARY(16384) NULL,
 ADD remote_uid VARCHAR(30) NULL,
 ADD sync_status VARCHAR(20) NOT NULL DEFAULT 'idle',
 ADD sync_message VARCHAR(1000) NULL,
 ADD last_attempt DATETIME NULL,
 ADD sync_cursor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE problem MODIFY difficulty ENUM('入门','普及','提高','省选') NULL DEFAULT NULL,
 ADD source_key VARCHAR(100) NULL,
 ADD problem_url VARCHAR(255) NULL,
 ADD native_difficulty VARCHAR(30) NULL,
 ADD UNIQUE KEY uk_platform_source(platform_id,source_key);
ALTER TABLE `record`
 ADD manual_submit_count INT NOT NULL DEFAULT 0,
 ADD manual_passed TINYINT NOT NULL DEFAULT 0,
 ADD manual_solve_date DATE NULL;
UPDATE `record` SET manual_submit_count=submit_count,manual_passed=passed,manual_solve_date=solve_date;
CREATE TABLE synced_submission (
 submission_id CHAR(36) PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 platform_id CHAR(36) NOT NULL,
 source_id VARCHAR(100) NOT NULL,
 account_login VARCHAR(100) NOT NULL,
 problem_id CHAR(36) NOT NULL,
 passed TINYINT NOT NULL,
 submitted_at DATETIME NOT NULL,
 UNIQUE KEY uk_source_submission(user_id,platform_id,source_id),
 KEY idx_sync_problem(user_id,problem_id),
 FOREIGN KEY (user_id) REFERENCES `user`(user_id),
 FOREIGN KEY (platform_id) REFERENCES platform(platform_id),
 FOREIGN KEY (problem_id) REFERENCES problem(problem_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT INTO platform(platform_id,platform_name,platform_url)
SELECT UUID(),'牛客','https://ac.nowcoder.com'
WHERE NOT EXISTS(SELECT 1 FROM platform WHERE platform_name='牛客');

-- Index for seven-day activity queries
USE acmer_stats;
ALTER TABLE synced_submission ADD INDEX idx_sync_submitted_at(submitted_at);

-- Native rating provenance
USE acmer_stats;
ALTER TABLE problem ADD difficulty_source VARCHAR(40) NULL;
UPDATE problem pr JOIN platform p ON p.platform_id=pr.platform_id
SET pr.difficulty_source='codeforces'
WHERE p.platform_name='Codeforces' AND pr.native_difficulty IS NOT NULL;

-- Bilingual tags and highest-25 ability reference
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

-- Undated Luogu practice inventory and separate daily activity
USE acmer_stats;
CREATE TABLE platform_problem_inventory(
 user_id CHAR(36) NOT NULL,platform_id CHAR(36) NOT NULL,problem_id CHAR(36) NOT NULL,
 account_uid VARCHAR(30) NOT NULL,passed TINYINT NOT NULL,observed_at DATETIME NOT NULL,
 PRIMARY KEY(user_id,problem_id),
 FOREIGN KEY(user_id) REFERENCES user(user_id),FOREIGN KEY(platform_id) REFERENCES platform(platform_id),FOREIGN KEY(problem_id) REFERENCES problem(problem_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE platform_daily_activity(
 user_id CHAR(36) NOT NULL,platform_id CHAR(36) NOT NULL,account_uid VARCHAR(30) NOT NULL,
 activity_day DATE NOT NULL,activity_count INT UNSIGNED NOT NULL,
 PRIMARY KEY(user_id,platform_id,account_uid,activity_day),KEY idx_activity_day(activity_day),
 FOREIGN KEY(user_id) REFERENCES user(user_id),FOREIGN KEY(platform_id) REFERENCES platform(platform_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE platform_snapshot(
 account_id CHAR(36) PRIMARY KEY,passed_count INT NOT NULL,attempted_count INT NOT NULL,activity_days INT NOT NULL,
 profile_passed_count INT NULL,profile_attempted_count INT NULL,
 observed_at DATETIME NOT NULL,FOREIGN KEY(account_id) REFERENCES platform_account(account_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE OR REPLACE VIEW v_problem_progress AS
SELECT user_id,problem_id,CONCAT(user_id,':',problem_id) AS record_id,MAX(passed) AS passed,MAX(solve_date) AS solve_date
FROM (SELECT user_id,problem_id,passed,solve_date FROM record
 UNION ALL SELECT user_id,problem_id,passed,NULL AS solve_date FROM platform_problem_inventory) progress
GROUP BY user_id,problem_id;

CREATE OR REPLACE VIEW v_platform_stats AS select `p`.`platform_id` AS `platform_id`,`p`.`platform_name` AS `platform_name`,count(`r`.`record_id`) AS `total_count`,coalesce(sum(`r`.`passed`),0) AS `passed_count`,round(((coalesce(sum(`r`.`passed`),0) / nullif(count(`r`.`record_id`),0)) * 100),1) AS `pass_rate` from ((`platform` `p` left join `problem` `pr` on((`pr`.`platform_id` = `p`.`platform_id`))) left join `v_problem_progress` `r` on((`r`.`problem_id` = `pr`.`problem_id`))) group by `p`.`platform_id`,`p`.`platform_name`;

CREATE OR REPLACE VIEW v_tag_stats AS select `t`.`tag_id` AS `tag_id`,`t`.`tag_name` AS `tag_name`,coalesce(`t`.`display_name`,`t`.`tag_name`) AS `display_name`,count(`r`.`record_id`) AS `total_count`,coalesce(sum(`r`.`passed`),0) AS `passed_count`,round(((coalesce(sum(`r`.`passed`),0) / nullif(count(`r`.`record_id`),0)) * 100),1) AS `pass_rate` from (((`tag` `t` join `problem_tag` `pt` on((`pt`.`tag_id` = `t`.`tag_id`))) join `problem` `pr` on((`pr`.`problem_id` = `pt`.`problem_id`))) join `v_problem_progress` `r` on((`r`.`problem_id` = `pr`.`problem_id`))) group by `t`.`tag_id`,`t`.`tag_name`,`t`.`display_name`;

CREATE OR REPLACE VIEW v_difficulty_stats AS select `pr`.`difficulty` AS `difficulty`,count(`r`.`record_id`) AS `total_count`,coalesce(sum(`r`.`passed`),0) AS `passed_count`,round(((coalesce(sum(`r`.`passed`),0) / count(`r`.`record_id`)) * 100),1) AS `pass_rate` from (`problem` `pr` join `v_problem_progress` `r` on((`r`.`problem_id` = `pr`.`problem_id`))) group by `pr`.`difficulty`;

CREATE OR REPLACE VIEW v_user_overview AS select `u`.`user_id` AS `user_id`,`u`.`user_name` AS `user_name`,count(distinct `r`.`record_id`) AS `total_problems`,count(distinct if((`r`.`passed` = 1),`r`.`record_id`,NULL)) AS `passed_problems`,round(((count(distinct if((`r`.`passed` = 1),`r`.`record_id`,NULL)) / count(distinct `r`.`record_id`)) * 100),1) AS `pass_rate`,count(distinct `pr`.`platform_id`) AS `platform_count`,count(distinct `pt`.`tag_id`) AS `tag_count`,min(`r`.`solve_date`) AS `first_solve_date`,max(`r`.`solve_date`) AS `last_solve_date` from (((`user` `u` left join `v_problem_progress` `r` on((`r`.`user_id` = `u`.`user_id`))) left join `problem` `pr` on((`pr`.`problem_id` = `r`.`problem_id`))) left join `problem_tag` `pt` on((`pt`.`problem_id` = `pr`.`problem_id`))) group by `u`.`user_id`,`u`.`user_name`;

CREATE OR REPLACE VIEW v_tag_ability AS with `totals` as (select `r`.`user_id` AS `user_id`,`pt`.`tag_id` AS `tag_id`,`pr`.`platform_id` AS `platform_id`,count(0) AS `total_count`,sum((`r`.`passed` = 1)) AS `passed_count` from ((`v_problem_progress` `r` join `problem` `pr` on((`pr`.`problem_id` = `r`.`problem_id`))) join `problem_tag` `pt` on((`pt`.`problem_id` = `pr`.`problem_id`))) group by `r`.`user_id`,`pt`.`tag_id`,`pr`.`platform_id`), `ranked` as (select `r`.`user_id` AS `user_id`,`pt`.`tag_id` AS `tag_id`,`pr`.`platform_id` AS `platform_id`,`pr`.`problem_id` AS `problem_id`,cast(`pr`.`native_difficulty` as decimal(10,2)) AS `rating`,row_number() OVER (PARTITION BY `r`.`user_id`,`pt`.`tag_id`,`pr`.`platform_id` ORDER BY cast(`pr`.`native_difficulty` as decimal(10,2)) desc,`pr`.`problem_id` )  AS `position` from (((`v_problem_progress` `r` join `problem` `pr` on((`pr`.`problem_id` = `r`.`problem_id`))) join `platform` `p` on((`p`.`platform_id` = `pr`.`platform_id`))) join `problem_tag` `pt` on((`pt`.`problem_id` = `pr`.`problem_id`))) where ((`r`.`passed` = 1) and (`p`.`platform_name` in ('Codeforces','AtCoder')) and regexp_like(`pr`.`native_difficulty`,'^[0-9]+([.][0-9]+)?$') and (((`p`.`platform_name` = 'Codeforces') and (`pr`.`difficulty_source` = 'codeforces')) or ((`p`.`platform_name` = 'AtCoder') and (`pr`.`difficulty_source` in ('atcoder_problems','atcoder_problems_experimental')))))), `ability` as (select `ranked`.`user_id` AS `user_id`,`ranked`.`tag_id` AS `tag_id`,`ranked`.`platform_id` AS `platform_id`,count(0) AS `rated_count`,sum((`ranked`.`position` <= 25)) AS `sample_count`,round(avg((case when (`ranked`.`position` <= 25) then `ranked`.`rating` end)),1) AS `ability_value`,min((case when (`ranked`.`position` <= 25) then `ranked`.`rating` end)) AS `min_difficulty`,max(`ranked`.`rating`) AS `max_difficulty` from `ranked` group by `ranked`.`user_id`,`ranked`.`tag_id`,`ranked`.`platform_id`) select `x`.`user_id` AS `user_id`,`x`.`tag_id` AS `tag_id`,`t`.`tag_name` AS `tag_name`,coalesce(`t`.`display_name`,`t`.`tag_name`) AS `display_name`,`x`.`platform_id` AS `platform_id`,`p`.`platform_name` AS `platform_name`,`x`.`total_count` AS `total_count`,`x`.`passed_count` AS `passed_count`,coalesce(`a`.`rated_count`,0) AS `rated_count`,coalesce(`a`.`sample_count`,0) AS `sample_count`,`a`.`ability_value` AS `ability_value`,`a`.`min_difficulty` AS `min_difficulty`,`a`.`max_difficulty` AS `max_difficulty`,(case when (`a`.`sample_count` = 25) then '满25题' when (`a`.`sample_count` > 0) then '样本不足' else '暂无有效评分' end) AS `sample_status` from (((`totals` `x` join `tag` `t` on((`t`.`tag_id` = `x`.`tag_id`))) join `platform` `p` on((`p`.`platform_id` = `x`.`platform_id`))) left join `ability` `a` on(((`a`.`user_id` = `x`.`user_id`) and (`a`.`tag_id` = `x`.`tag_id`) and (`a`.`platform_id` = `x`.`platform_id`))));

USE acmer_stats;
ALTER TABLE problem ADD metadata_checked_at DATETIME NULL COMMENT 'Last successful Luogu metadata refresh';

-- Submission-level history and ordered pagination
ALTER TABLE synced_submission ADD verdict VARCHAR(40) NULL, ADD INDEX idx_submission_page(user_id,submitted_at DESC,submission_id DESC);
UPDATE synced_submission SET verdict='AC' WHERE passed=1;

CREATE TABLE account_rating (
 account_id CHAR(36) PRIMARY KEY,
 rating DECIMAL(10,2) NULL,
 scale VARCHAR(60) NOT NULL,
 status VARCHAR(24) NOT NULL,
 message VARCHAR(240) NULL,
 source_url VARCHAR(255) NULL,
 fetched_at DATETIME NULL,
 last_attempt DATETIME NOT NULL,
 FOREIGN KEY(account_id) REFERENCES platform_account(account_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE user_skill_settings (
 user_id CHAR(36) PRIMARY KEY,
 config JSON NOT NULL,
 revision INT UNSIGNED NOT NULL DEFAULT 1,
 topology_draft JSON NULL,
 draft_revision INT UNSIGNED NOT NULL DEFAULT 0,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ability_snapshot (
 snapshot_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 observed_at DATETIME(3) NOT NULL,
 origin VARCHAR(16) NOT NULL,
 metrics JSON NOT NULL,
 INDEX idx_ability_snapshot_user (user_id, snapshot_id),
 FOREIGN KEY(user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS problem_note (
 user_id CHAR(36) NOT NULL,
 problem_id CHAR(36) NOT NULL,
 note VARCHAR(30) NOT NULL,
 PRIMARY KEY (user_id, problem_id),
 FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE,
 FOREIGN KEY (problem_id) REFERENCES problem(problem_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_submission_first_ac ON synced_submission(user_id,problem_id,passed,submitted_at,submission_id);
