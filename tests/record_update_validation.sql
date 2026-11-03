-- Run mysql with --force to continue after the three expected SQLSTATE 45000 errors.
-- All test changes are rolled back. Requires at least one existing record.
USE acmer_stats;
START TRANSACTION;
SET @id = (SELECT record_id FROM `record` ORDER BY record_id LIMIT 1);
SELECT submit_count, solve_date INTO @old_count, @old_date FROM `record` WHERE record_id=@id;
UPDATE `record` SET solve_date=DATE_ADD(CURDATE(), INTERVAL 1 DAY) WHERE record_id=@id;
UPDATE `record` SET submit_count=0 WHERE record_id=@id;
UPDATE `record` SET submit_count=1000 WHERE record_id=@id;
SELECT IF(COUNT(*)=1 AND MIN(submit_count=@old_count AND solve_date=@old_date)=1,'invalid_updates_rejected','FAIL') AS result FROM `record` WHERE record_id=@id;
UPDATE `record` SET submit_count=999,solve_date=CURDATE() WHERE record_id=@id;
SELECT IF(submit_count=999 AND solve_date=CURDATE(),'upper_boundary_accepted','FAIL') AS result FROM `record` WHERE record_id=@id;
UPDATE `record` SET submit_count=1 WHERE record_id=@id;
SELECT IF(submit_count=1,'lower_boundary_accepted','FAIL') AS result FROM `record` WHERE record_id=@id;
ROLLBACK;
SELECT IF(submit_count=@old_count AND solve_date=@old_date,'original_record_restored','FAIL') AS result FROM `record` WHERE record_id=@id;
