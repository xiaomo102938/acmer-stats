USE acmer_stats;
ALTER TABLE problem ADD metadata_checked_at DATETIME NULL COMMENT 'Last successful Luogu metadata refresh';
