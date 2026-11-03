USE acmer_stats;
ALTER TABLE problem ADD difficulty_source VARCHAR(40) NULL;
UPDATE problem pr JOIN platform p ON p.platform_id=pr.platform_id
SET pr.difficulty_source='codeforces'
WHERE p.platform_name='Codeforces' AND pr.native_difficulty IS NOT NULL;
