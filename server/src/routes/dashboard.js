import { Router } from 'express';
import { all, get } from '../db/index.js';
import { ah } from '../lib/http.js';
import { mapProject, mapTask, mapRun, mapService } from '../lib/mappers.js';
import { listActivity } from '../lib/activity.js';
import { dockerAvailable } from '../lib/docker.js';

export const dashboardRouter = Router();

const dayKey = (d) => d.toISOString().slice(0, 10);

dashboardRouter.get(
  '/',
  ah(async (req, res) => {
    const userId = req.userId;
    const today = new Date();
    const todayKey = dayKey(today);

    const projects = all(
      "SELECT * FROM projects WHERE user_id = ? AND status = 'active' ORDER BY updated_at DESC",
      userId
    ).map((row) => {
      const counts = get(
        `SELECT
           (SELECT COUNT(*) FROM tasks WHERE project_id = ? AND status != 'done') AS open_tasks,
           (SELECT COUNT(*) FROM tasks WHERE project_id = ? AND status = 'done') AS done_tasks,
           (SELECT COUNT(*) FROM notes WHERE project_id = ?) AS notes,
           (SELECT COUNT(*) FROM commands WHERE project_id = ?) AS commands,
           (SELECT COUNT(*) FROM services WHERE project_id = ? AND status = 'running') AS services`,
        row.id,
        row.id,
        row.id,
        row.id,
        row.id
      );
      return {
        ...mapProject(row),
        counts: {
          openTasks: counts.open_tasks,
          doneTasks: counts.done_tasks,
          notes: counts.notes,
          commands: counts.commands,
          runningServices: counts.services,
        },
      };
    });

    const tasksDueToday = all(
      `SELECT t.* FROM tasks t WHERE t.user_id = ? AND t.status != 'done'
         AND (date(t.due_date) = date(?) OR (t.due_date IS NULL AND t.priority IN ('high','urgent')))
       ORDER BY date(t.due_date) IS NULL, t.due_date, CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END
       LIMIT 8`,
      userId,
      todayKey
    ).map((r) => ({ ...mapTask(r), projectName: projects.find((p) => p.id === r.project_id)?.name ?? null }));

    const taskStats = get(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN date(due_date) = date(?) AND status != 'done' THEN 1 ELSE 0 END) AS due_today,
        SUM(CASE WHEN date(completed_at) = date(?) THEN 1 ELSE 0 END) AS completed_today,
        SUM(CASE WHEN date(due_date) < date(?) AND status != 'done' AND due_date IS NOT NULL THEN 1 ELSE 0 END) AS overdue
       FROM tasks WHERE user_id = ?`,
      todayKey,
      todayKey,
      todayKey,
      userId
    );

    const recentRuns = all(
      'SELECT * FROM command_runs WHERE user_id = ? ORDER BY started_at DESC LIMIT 6',
      userId
    ).map((r) => ({ ...mapRun(r), projectName: projects.find((p) => p.id === r.project_id)?.name ?? null }));

    const services = all('SELECT * FROM services WHERE user_id = ? ORDER BY name', userId).map(mapService);

    const commandStats = get(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN date(started_at) = date(?) THEN 1 ELSE 0 END) AS today,
        SUM(CASE WHEN status = 'success' AND date(started_at) = date(?) THEN 1 ELSE 0 END) AS today_success,
        SUM(CASE WHEN status = 'failed' AND date(started_at) = date(?) THEN 1 ELSE 0 END) AS today_failed
       FROM command_runs WHERE user_id = ?`,
      todayKey,
      todayKey,
      todayKey,
      userId
    );

    const commits = all(
      `SELECT project_id, data FROM github_repos WHERE user_id = ?`,
      userId
    )
      .flatMap((r) =>
        (JSON.parse(r.data || '{}').commits || []).map((c) => ({ ...c, projectId: r.project_id }))
      )
      .filter((c) => c.date)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const commitsToday = commits.filter((c) => String(c.date).slice(0, 10) === todayKey).length;

    // 7-day activity sparkline of everything the user did.
    const week = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const key = dayKey(d);
      const row = get(
        `SELECT
           SUM(CASE WHEN type = 'command' THEN 1 ELSE 0 END) AS commands,
           SUM(CASE WHEN type = 'task' THEN 1 ELSE 0 END) AS tasks,
           SUM(CASE WHEN type = 'commit' THEN 1 ELSE 0 END) AS commits,
           SUM(CASE WHEN type = 'note' THEN 1 ELSE 0 END) AS notes
         FROM activity WHERE user_id = ? AND date(created_at) = date(?)`,
        userId,
        key
      );
      week.push({
        date: key,
        label: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }),
        commands: row?.commands || 0,
        tasks: row?.tasks || 0,
        commits: row?.commits || 0,
        notes: row?.notes || 0,
        total: (row?.commands || 0) + (row?.tasks || 0) + (row?.commits || 0) + (row?.notes || 0),
      });
    }

    const activity = listActivity(userId, { limit: 12 }).data;
    const notes = all(
      'SELECT id, title, kind, updated_at, project_id FROM notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5',
      userId
    );

    const docker = await dockerAvailable();

    res.json({
      data: {
        greeting: greet(),
        stats: {
          activeProjects: projects.length,
          openTasks: (taskStats.total || 0) - (taskStats.done || 0),
          tasksDueToday: taskStats.due_today || 0,
          tasksCompletedToday: taskStats.completed_today || 0,
          overdueTasks: taskStats.overdue || 0,
          runningServices: services.filter((s) => s.status === 'running').length,
          totalServices: services.length,
          commandsToday: commandStats.today || 0,
          commandsFailedToday: commandStats.today_failed || 0,
          commitsToday,
          commitsWeek: commits.filter(
            (c) => Date.parse(c.date) > Date.now() - 7 * 86400000
          ).length,
        },
        projects,
        tasksDueToday,
        recentRuns,
        services: services.slice(0, 6),
        recentCommits: commits.slice(0, 8),
        activity,
        notes,
        week,
        docker: { connected: docker.connected, message: docker.message },
      },
    });
  })
);

function greet() {
  const h = new Date().getUTCHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
