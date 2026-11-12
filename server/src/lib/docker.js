/**
 * Thin Docker Engine API client over the unix socket. No dependency on the
 * docker CLI or dockerode — just HTTP over the socket, with graceful fallbacks
 * so DevDeck works on machines without a daemon.
 */
import http from 'node:http';
import { config } from '../config.js';

function request(path, { method = 'GET', timeout = 2500 } = {}) {
  return new Promise((resolve, reject) => {
    const socketPath = config.docker.host.replace(/^unix:\/\//, '');
    const req = http.request(
      { socketPath, path, method, timeout, headers: { Host: 'docker' } },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          if (res.statusCode >= 400) return reject(new Error(`docker ${res.statusCode}: ${body.slice(0, 200)}`));
          try {
            resolve(body ? JSON.parse(body) : null);
          } catch {
            resolve(body);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('docker request timed out')));
    req.on('error', reject);
    req.end();
  });
}

let cache = { at: 0, value: null };

export async function dockerAvailable({ refresh = false } = {}) {
  if (!config.docker.enabled) {
    return { connected: false, host: config.docker.host, message: 'Docker integration disabled (DOCKER_ENABLED=false)' };
  }
  if (!refresh && cache.value && Date.now() - cache.at < 8000) return cache.value;
  try {
    const info = await request('/version');
    const value = {
      connected: true,
      host: config.docker.host,
      message: `Docker ${info?.Version || ''} on ${info?.Os || ''}/${info?.Arch || ''}`.trim(),
    };
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    const value = {
      connected: false,
      host: config.docker.host,
      message: `Docker daemon unreachable — showing tracked services. (${err.code || err.message})`,
    };
    cache = { at: Date.now(), value };
    return value;
  }
}

export async function listContainers() {
  try {
    const list = await request('/containers/json?all=1');
    if (!Array.isArray(list)) return [];
    return list.map((c) => ({
      id: c.Id,
      shortId: c.Id.slice(0, 12),
      name: (c.Names?.[0] || '').replace(/^\//, ''),
      image: c.Image,
      state: c.State,
      status: c.Status,
      ports: (c.Ports || []).map((p) =>
        p.PublicPort ? `${p.PublicPort}→${p.PrivatePort}/${p.Type}` : `${p.PrivatePort}/${p.Type}`
      ),
      created: c.Created,
    }));
  } catch {
    return [];
  }
}

export async function containerAction(id, action) {
  const map = { start: 'start', stop: 'stop', restart: 'restart' };
  if (!map[action]) return null;
  try {
    return await request(`/containers/${id}/${map[action]}`, { method: 'POST' });
  } catch {
    return null;
  }
}

export function clearDockerCache() {
  cache = { at: 0, value: null };
}
