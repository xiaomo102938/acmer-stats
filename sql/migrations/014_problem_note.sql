CREATE TABLE IF NOT EXISTS problem_note (
 user_id CHAR(36) NOT NULL,
 problem_id CHAR(36) NOT NULL,
 note VARCHAR(30) NOT NULL,
 PRIMARY KEY (user_id, problem_id),
 FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE,
 FOREIGN KEY (problem_id) REFERENCES problem(problem_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_submission_first_ac ON synced_submission(user_id,problem_id,passed,submitted_at,submission_id);
