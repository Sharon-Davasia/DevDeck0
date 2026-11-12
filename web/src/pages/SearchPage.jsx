import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useApi, useDebounced } from '../lib/useApi.js';
import { Badge, Button, EmptyState, SearchInput, Select, Skeleton, Tabs } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { relativeTime } from '../lib/format.js';

const ENTITY_META = {
  project: { label: 'Projects', icon: 'folder', to: (r) => `/projects/${r.id}` },
  task: { label: 'Tasks', icon: 'check-square', to: () => '/tasks' },
  note: { label: 'Notes', icon: 'note', to: (r) => `/notes/${r.id}` },
  command: { label: 'Commands', icon: 'terminal', to: () => '/commands' },
  run: { label: 'Command runs', icon: 'play', to: () => '/commands?tab=history' },
  service: { label: 'Services', icon: 'server', to: () => '/services' },
  repo: { label: 'Repositories', icon: 'git-branch', to: () => '/github' },
  activity: { label: 'Activity', icon: 'activity', to: () => '/activity' },
};

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [projectId, setProjectId] = useState('');
  const [type, setType] = useState('all');
  const debounced = useDebounced(query, 220);

  const { data, loading } = useApi(
    `/search${qs({ q: debounced, projectId: projectId || undefined, types: type === 'all' ? undefined : type })}`,
    { deps: [debounced, projectId, type], skip: !debounced }
  );
  const { data: projects } = useApi('/projects?status=all', { initialData: [] });
  const { data: recent } = useApi('/search/recent');

  useEffect(() => {
    if (debounced) {
      params.set('q', debounced);
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const results = data?.results || [];
  const grouped = data?.grouped || {};

  const counts = useMemo(() => {
    const c = {};
    for (const [k, v] of Object.entries(grouped)) c[k] = v.length;
    return c;
  }, [grouped]);

  const visibleGroups = useMemo(() => {
    const order = ['project', 'task', 'note', 'command', 'run', 'service', 'repo', 'activity'];
    return order.filter((k) => grouped[k]?.length);
  }, [grouped]);

  return (
    <div>
      <PageHeader
        title="Search"
        subtitle="Full-text search across projects, tasks, notes, commands, runs, services, repositories and activity."
      />

      <div className="mb-4 space-y-2.5">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search your entire workspace…"
          autoFocus
          className="text-[14px]"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Tabs
            value={type}
            onChange={setType}
            tabs={[
              { value: 'all', label: 'Everything', icon: 'grid' },
              ...Object.entries(ENTITY_META)
                .filter(([k]) => counts[k])
                .map(([k, m]) => ({ value: k, label: m.label, icon: m.icon, count: counts[k] })),
            ]}
          />
          <Select
            value={projectId}
            onChange={setProjectId}
            size="sm"
            className="sm:ml-auto sm:w-44"
            options={[
              { value: '', label: 'All projects' },
              ...(projects || []).map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
      </div>

      {!debounced ? (
        <div className="card">
          <EmptyState
            icon="search"
            title="Search everything"
            description="Type a project, task, note title, command, commit message or service name. Results are grouped by type with contextual previews."
          />
          {recent?.length > 0 && (
            <div className="border-t border-line-soft px-5 py-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Recently updated</p>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((r) => (
                  <button
                    key={`${r.entity}-${r.entity_id}`}
                    onClick={() => setQuery(r.title.split(' ').slice(0, 3).join(' '))}
                    className="chip transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
                  >
                    <Icon name={ENTITY_META[r.entity]?.icon || 'search'} size={10} />
                    {r.title.slice(0, 46)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : loading && !results.length ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-3.5 w-2/3" />
              <Skeleton className="mt-2 h-2.5 w-full" />
            </div>
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="search"
            title={`No results for “${debounced}”`}
            description="Try fewer words, a different spelling, or clear the filters. Search matches titles, bodies, tags and command text."
            action={
              <Button size="sm" variant="secondary" onClick={() => { setQuery(''); setProjectId(''); setType('all'); }}>
                Reset search
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[12px] text-muted">
            <span className="font-semibold text-ink">{data.total}</span> result{data.total === 1 ? '' : 's'} for “
            {debounced}”
          </p>
          {visibleGroups.map((key) => {
            const meta = ENTITY_META[key];
            return (
              <section key={key} className="card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-line-soft bg-[#fbfcfe] px-4 py-2">
                  <Icon name={meta.icon} size={13} className="text-muted" />
                  <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-soft">{meta.label}</h2>
                  <Badge className="bg-line-soft text-[10px] text-muted">{grouped[key].length}</Badge>
                </div>
                <ul className="divide-y divide-line-soft">
                  {grouped[key].map((r) => (
                    <li key={`${r.entity}-${r.id}`}>
                      <Link to={meta.to(r)} className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-[#fafbfd]">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-medium text-ink">{r.title}</p>
                          {r.snippet && (
                            <p className="mt-0.5 line-clamp-2 font-mono text-[11px] leading-relaxed text-muted">
                              {r.snippet}
                            </p>
                          )}
                          <div className="mt-1 flex items-center gap-2">
                            {r.projectName && <span className="chip text-[10px]">{r.projectName}</span>}
                            <span className="text-[10px] text-muted">{relativeTime(r.updatedAt)}</span>
                          </div>
                        </div>
                        <Icon name="arrow-right" size={13} className="mt-1 shrink-0 text-muted/60" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
