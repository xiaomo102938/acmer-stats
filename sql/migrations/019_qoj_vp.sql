CREATE TABLE IF NOT EXISTS qoj_vp_session (
 account_id CHAR(36) NOT NULL,
 contest_key VARCHAR(20) CHARACTER SET ascii NOT NULL,
 contest_name VARCHAR(512) NOT NULL,
 starts_at DATETIME NOT NULL,
 PRIMARY KEY (account_id,contest_key,starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
