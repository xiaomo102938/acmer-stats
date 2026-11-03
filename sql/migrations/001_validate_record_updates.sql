-- Existing databases: apply once. No existing records are modified.
USE acmer_stats;
DELIMITER //
CREATE TRIGGER trg_record_check_update
BEFORE UPDATE ON `record`
FOR EACH ROW
BEGIN
  IF NEW.solve_date > CURDATE() THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '刷题日期不能晚于今天';
  END IF;
  IF NEW.submit_count < 1 OR NEW.submit_count > 999 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '提交次数必须在 1~999 之间';
  END IF;
END //
DELIMITER ;
