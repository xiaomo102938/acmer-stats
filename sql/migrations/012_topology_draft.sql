ALTER TABLE user_skill_settings ADD COLUMN topology_draft JSON NULL, ADD COLUMN draft_revision INT UNSIGNED NOT NULL DEFAULT 0;
