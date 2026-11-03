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
  COLLATE utf8mb4_general_ci;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='刷题平台表';

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='题目表';

-- <<<sec_t_tag>>>
-- ----------------------------------------------------------------------------
-- 4. 题型标签表 tag：动态规划、图论、贪心等题型分类
-- ----------------------------------------------------------------------------
CREATE TABLE `tag` (
  tag_id   CHAR(36)    NOT NULL                   COMMENT '标签编号（UUID 主键）',
  tag_name VARCHAR(30) NOT NULL                   COMMENT '标签名称',
  PRIMARY KEY (tag_id),
  UNIQUE KEY uk_tag_name (tag_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='题型标签表';

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='题目-标签联系表';

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='刷题记录表';

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='平台账号表';

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
