-- Supporting indexes for the hot dashboard and history queries.

CREATE INDEX IF NOT EXISTS idx_tasks_activity ON tasks(user_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_runs_started ON command_runs(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(user_id, created_at DESC, type);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_repos_full_name ON github_repos(user_id, full_name);
