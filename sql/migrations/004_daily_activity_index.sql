USE acmer_stats;
ALTER TABLE synced_submission ADD INDEX idx_sync_submitted_at(submitted_at);
