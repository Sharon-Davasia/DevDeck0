/**
 * GitHub integration. Works in two modes:
 *   • Live   — a personal access token is stored for the user (encrypted at
 *              rest with a key derived from JWT_SECRET), so repositories,
 *              commits, PRs and issues are fetched from the real API.
 *   • Cached — demo/offline mode serving the synced snapshot in
 *              `github_repos.data`, so the UI is always useful.
 */
import { get, run, all } from '../db/index.js';
import { newId, now } from '../lib/http.js';
import { config } from '../config.js';
import { encrypt, decrypt } from './crypto.js';
import { mapRepo } from '../lib/mappers.js';

const API = 'https://api.github.com';

async function ghFetch(token, path) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'DevDeck',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

export function getIntegration(userId) {
  return get('SELECT * FROM integrations WHERE user_id = ? AND provider = ?', userId, 'github');
}

export function getToken(userId) {
  const row = getIntegration(userId);
  if (!row?.secret) return config.github.token || null;
  try {
    return decrypt(row.secret);
  } catch {
    return config.github.token || null;
  }
}

export function saveIntegration(userId, { account, token, status = 'connected', configJson = {} }) {
  const existing = getIntegration(userId);
  const ts = now();
  if (existing) {
    run(
      `UPDATE integrations SET account = ?, secret = ?, config = ?, status = ?, updated_at = ? WHERE id = ?`,
      account ?? existing.account,
      token === undefined ? existing.secret : token ? encrypt(token) : null,
      JSON.stringify(configJson),
      status,
      ts,
      existing.id
    );
    return getIntegration(userId);
  }
  const id = newId();
  run(
    `INSERT INTO integrations (id, user_id, provider, account, secret, config, status, created_at, updated_at)
     VALUES (?, ?, 'github', ?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    account || null,
    token ? encrypt(token) : null,
    JSON.stringify(configJson),
    status,
    ts,
    ts
  );
  return getIntegration(userId);
}

export function publicIntegration(row) {
  if (!row) return { provider: 'github', status: 'disconnected', account: null };
  return {
    provider: row.provider,
    status: row.status,
    account: row.account,
    hasToken: Boolean(row.secret),
    config: JSON.parse(row.config || '{}'),
    updatedAt: row.updated_at,
  };
}

/** Validate a token against the GitHub API and return the login. */
export async function verifyToken(token) {
  try {
    const me = await ghFetch(token, '/user');
    return { ok: true, login: me.login, name: me.name, avatarUrl: me.avatar_url };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function normaliseRepo(raw) {
  return {
    fullName: raw.full_name,
    description: raw.description || '',
    defaultBranch: raw.default_branch || 'main',
    language: raw.language || null,
    stars: raw.stargazers_count || 0,
    openIssues: raw.open_issues_count || 0,
    htmlUrl: raw.html_url,
    private: Boolean(raw.private),
    updatedAt: raw.updated_at,
  };
}

/**
 * Sync a repository (or all of a user's repos when `fullName` is omitted).
 * Returns the cached snapshot shape used by the UI.
 */
export async function syncRepo(userId, { projectId, fullName, repoId }) {
  const token = getToken(userId);
  const existing = repoId
    ? get('SELECT * FROM github_repos WHERE id = ? AND user_id = ?', repoId, userId)
    : get('SELECT * FROM github_repos WHERE user_id = ? AND full_name = ?', userId, fullName);
  const target = fullName || existing?.full_name;
  if (!target) throw new Error('Repository name required');

  if (!token) {
    if (!existing) throw new Error('Connect GitHub to sync live data');
    run('UPDATE github_repos SET synced_at = ? WHERE id = ?', now(), existing.id);
    return mapRepo(get('SELECT * FROM github_repos WHERE id = ?', existing.id));
  }

  const [repo, commits, branches, prs, issues, contributors] = await Promise.all([
    ghFetch(token, `/repos/${target}`),
    ghFetch(token, `/repos/${target}/commits?per_page=10`).catch(() => []),
    ghFetch(token, `/repos/${target}/branches?per_page=10`).catch(() => []),
    ghFetch(token, `/repos/${target}/pulls?state=open&per_page=10`).catch(() => []),
    ghFetch(token, `/repos/${target}/issues?state=open&per_page=10`).catch(() => []),
    ghFetch(token, `/repos/${target}/contributors?per_page=6`).catch(() => []),
  ]);

  const data = {
    commits: (commits || []).map((c) => ({
      sha: c.sha?.slice(0, 7),
      message: c.commit?.message?.split('\n')[0] || '',
      author: c.commit?.author?.name || c.author?.login || 'unknown',
      date: c.commit?.author?.date,
      url: c.html_url,
    })),
    branches: (branches || []).map((b) => ({ name: b.name, sha: b.commit?.sha?.slice(0, 7) })),
    pullRequests: (prs || []).map((p) => ({
      number: p.number,
      title: p.title,
      author: p.user?.login,
      url: p.html_url,
      draft: p.draft,
      updatedAt: p.updated_at,
    })),
    issues: (issues || [])
      .filter((i) => !i.pull_request)
      .map((i) => ({ number: i.number, title: i.title, author: i.user?.login, url: i.html_url, labels: i.labels?.map((l) => l.name) })),
    contributors: (contributors || []).map((c) => ({
      login: c.login,
      contributions: c.contributions,
      avatarUrl: c.avatar_url,
    })),
  };

  const snapshot = {
    full_name: target,
    description: repo.description || '',
    default_branch: repo.default_branch || 'main',
    language: repo.language || null,
    stars: repo.stargazers_count || 0,
    open_issues: data.issues.length,
    open_prs: data.pullRequests.length,
    data: JSON.stringify(data),
    synced_at: now(),
  };

  if (existing) {
    run(
      `UPDATE github_repos SET description = ?, default_branch = ?, language = ?, stars = ?,
        open_issues = ?, open_prs = ?, data = ?, synced_at = ? WHERE id = ?`,
      snapshot.description,
      snapshot.default_branch,
      snapshot.language,
      snapshot.stars,
      snapshot.open_issues,
      snapshot.open_prs,
      snapshot.data,
      snapshot.synced_at,
      existing.id
    );
    return mapRepo(get('SELECT * FROM github_repos WHERE id = ?', existing.id));
  }

  const id = newId();
  run(
    `INSERT INTO github_repos (id, user_id, project_id, full_name, description, default_branch, language, stars, open_issues, open_prs, data, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    projectId || null,
    snapshot.full_name,
    snapshot.description,
    snapshot.default_branch,
    snapshot.language,
    snapshot.stars,
    snapshot.open_issues,
    snapshot.open_prs,
    snapshot.data,
    snapshot.synced_at
  );
  return mapRepo(get('SELECT * FROM github_repos WHERE id = ?', id));
}

export async function listRemoteRepos(userId) {
  const token = getToken(userId);
  if (!token) return null;
  const repos = await ghFetch(token, '/user/repos?sort=updated&per_page=30');
  return repos.map(normaliseRepo);
}

export function listLinkedRepos(userId) {
  return all('SELECT * FROM github_repos WHERE user_id = ? ORDER BY synced_at DESC', userId).map(mapRepo);
}
