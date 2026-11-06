CREATE TABLE IF NOT EXISTS qoj_contest_medal (
  contest_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  problem_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  accepted_teams INT UNSIGNED NOT NULL,
  total_teams INT UNSIGNED NOT NULL,
  tier ENUM('iron','bronze','silver','gold') NOT NULL,
  board_source VARCHAR(64) NOT NULL,
  PRIMARY KEY (contest_key,problem_key),
  KEY idx_qoj_medal_problem (problem_key)
) ENGINE=InnoDB;
