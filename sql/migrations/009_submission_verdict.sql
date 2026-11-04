USE acmer_stats;
ALTER TABLE synced_submission ADD verdict VARCHAR(40) NULL,
 ADD INDEX idx_submission_page(user_id,submitted_at DESC,submission_id DESC);
UPDATE synced_submission SET verdict='AC' WHERE passed=1;
