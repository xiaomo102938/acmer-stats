USE acmer_stats;
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
