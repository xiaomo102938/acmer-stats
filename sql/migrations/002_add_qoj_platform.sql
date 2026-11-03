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
