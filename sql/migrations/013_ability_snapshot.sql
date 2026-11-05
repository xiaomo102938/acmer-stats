CREATE TABLE IF NOT EXISTS ability_snapshot (
 snapshot_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id CHAR(36) NOT NULL,
 observed_at DATETIME(3) NOT NULL,
 origin VARCHAR(16) NOT NULL,
 metrics JSON NOT NULL,
 INDEX idx_ability_snapshot_user (user_id, snapshot_id),
 FOREIGN KEY(user_id) REFERENCES user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
