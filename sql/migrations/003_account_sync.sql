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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO platform(platform_id,platform_name,platform_url)
SELECT UUID(),'牛客','https://ac.nowcoder.com'
WHERE NOT EXISTS(SELECT 1 FROM platform WHERE platform_name='牛客');
