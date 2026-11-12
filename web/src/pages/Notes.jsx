import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, qs } from '../lib/api.js';
import { useApi, useDebounced } from '../lib/useApi.js';
import {
  Badge,
  Button,
  CodeBlock,
  EmptyState,
  ErrorState,
  IconButton,
  Modal,
  SearchInput,
  Select,
  Skeleton,
  Tabs,
  Tooltip,
  useConfirm,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { NOTE_KIND, relativeTime } from '../lib/format.js';
import { plainText, renderMarkdown } from '../lib/markdown.js';

const EMPTY = { title: '', body: '', tags: '', kind: 'note', projectId: '', pinned: false };

export default function Notes() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [kind, setKind] = useState('all');
  const [projectFilter, setProjectFilter] = useState('');
  const [tag, setTag] = useState('');
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, 220);
  const [modalOpen, setModalOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const { data, loading, error, refresh, setData } = useApi(
    `/notes${qs({ kind, projectId: projectFilter || undefined, tag: tag || undefined, q: debounced || undefined })}`,
    { deps: [kind, projectFilter, tag, debounced], initialData: [] }
  );
  const { data: projects } = useApi('/projects?status=all', { initialData: [] });
  const { data: tagData, refresh: refreshTags } = useApi('/notes/tags', { initialData: [] });

  const notes = Array.isArray(data) ? data : [];

  useEffect(() => {
    if (params.get('new') === '1') {
      setForm({ ...EMPTY, projectId: projectFilter || '' });
      setModalOpen(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    if (!form.title.trim()) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await api.post('/notes', {
        title: form.title.trim(),
        body: form.body,
        tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
        kind: form.kind,
        projectId: form.projectId || null,
        pinned: form.pinned,
      });
      toast.success('Note created');
      setModalOpen(false);
      setForm(EMPTY);
      refreshTags({ silent: true });
      navigate(`/notes/${res.data.id}`);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(note) {
    const ok = await confirm({ title: `Delete “${note.title}”?`, confirmLabel: 'Delete note' });
    if (!ok) return;
    setData((prev) => (prev || []).filter((n) => n.id !== note.id));
    try {
      await api.del(`/notes/${note.id}`);
      toast.success('Note deleted');
    } catch (err) {
      toast.error(err.message);
      refresh();
    }
  }

  async function togglePin(note) {
    setData((prev) => (prev || []).map((n) => (n.id === note.id ? { ...n, pinned: !n.pinned } : n)));
    try {
      await api.patch(`/notes/${note.id}`, { pinned: !note.pinned });
    } catch (err) {
      toast.error(err.message);
      refresh({ silent: true });
    }
  }

  const tags = Array.isArray(tagData) ? tagData : [];

  return (
    <div>
      <PageHeader
        title="Notes"
        subtitle="Decisions, debugging findings, snippets and documentation — searchable and versioned."
        actions={
          <Button
            variant="primary"
            size="sm"
            icon="plus"
            onClick={() => {
              setForm({ ...EMPTY, projectId: projectFilter || '' });
              setModalOpen(true);
            }}
          >
            New note
          </Button>
        }
      />

      <div className="mb-3 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <Tabs
          value={kind}
          onChange={setKind}
          tabs={[
            { value: 'all', label: 'All' },
            ...Object.entries(NOTE_KIND).map(([v, k]) => ({ value: v, label: k.label, icon: k.icon })),
          ]}
        />
        <div className="flex items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Search notes…" className="w-44 sm:w-52" />
          <Select
            value={projectFilter}
            onChange={setProjectFilter}
            size="sm"
            className="hidden min-w-[130px] sm:block"
            options={[
              { value: '', label: 'All projects' },
              ...(projects || []).map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </div>
      </div>

      {tags.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Icon name="tag" size={12} className="text-muted" />
          {tag && (
            <button
              onClick={() => setTag('')}
              className="chip border-brand-200 bg-brand-50 text-brand-700"
            >
              #{tag} <Icon name="x" size={10} />
            </button>
          )}
          {!tag &&
            tags.slice(0, 12).map((t) => (
              <button key={t.tag} onClick={() => setTag(t.tag)} className="chip transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700">
                #{t.tag} <span className="text-muted/70">{t.count}</span>
              </button>
            ))}
        </div>
      )}

      {loading && !notes.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="mt-2.5 h-3.5 w-3/4" />
              <Skeleton className="mt-2 h-2.5 w-full" />
              <Skeleton className="mt-1.5 h-2.5 w-5/6" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card"><ErrorState error={error} onRetry={() => refresh()} /></div>
      ) : notes.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="note"
            title={debounced || tag ? 'No notes match' : 'No notes yet'}
            description={
              debounced || tag
                ? 'Try a different search term or clear the tag filter.'
                : 'Notes are where you record why a decision was made, how you debugged something, or the snippet you always forget.'
            }
            action={
              <Button size="sm" variant="primary" icon="plus" onClick={() => setModalOpen(true)}>
                Write your first note
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {notes.map((n) => {
            const meta = NOTE_KIND[n.kind] || NOTE_KIND.note;
            return (
              <div key={n.id} className="group card card-hover flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-line-soft text-soft">
                      <Icon name={meta.icon} size={12} />
                    </span>
                    <Badge className="bg-line-soft text-muted">{meta.label}</Badge>
                    {n.pinned && <Icon name="pin" size={11} className="text-amber-500" />}
                  </div>
                  <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Tooltip label={n.pinned ? 'Unpin' : 'Pin'}>
                      <IconButton icon="pin" label="Pin note" onClick={() => togglePin(n)} />
                    </Tooltip>
                    <Tooltip label="Delete">
                      <IconButton icon="trash" label="Delete note" onClick={() => remove(n)} className="hover:text-red-600" />
                    </Tooltip>
                  </div>
                </div>

                <Link to={`/notes/${n.id}`} className="mt-2 flex-1">
                  <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink transition-colors group-hover:text-brand-700">
                    {n.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-3 text-[11.5px] leading-relaxed text-muted">{plainText(n.body, 180)}</p>
                </Link>

                {n.tags?.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {n.tags.slice(0, 3).map((t) => (
                      <button
                        key={t}
                        onClick={() => setTag(t)}
                        className="chip text-[10.5px] transition-colors hover:text-brand-700"
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}

                <div className="mt-2.5 flex items-center justify-between border-t border-line-soft pt-2 text-[10.5px] text-muted">
                  <span className="truncate">{n.projectName || 'No project'}</span>
                  <span>{relativeTime(n.updatedAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New note"
        description="Markdown is supported. Snapshots are kept as you edit."
        size="xl"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setPreview((v) => !v)} icon={preview ? 'edit' : 'eye'}>
              {preview ? 'Edit' : 'Preview'}
            </Button>
            <div className="flex-1" />
            <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={save} loading={saving} disabled={!form.title.trim()}>
              Create note
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <input
            className="input text-[14px] font-semibold"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Note title"
            autoFocus
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <Select
              value={form.kind}
              onChange={(v) => setForm({ ...form, kind: v })}
              options={Object.entries(NOTE_KIND).map(([v, k]) => ({ value: v, label: k.label }))}
            />
            <Select
              value={form.projectId}
              onChange={(v) => setForm({ ...form, projectId: v })}
              options={[
                { value: '', label: 'No project' },
                ...(projects || []).map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <input
              className="input"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              placeholder="tags: adr, debugging"
            />
          </div>
          {preview ? (
            <div
              className="prose-devdeck min-h-[260px] rounded-xl border border-line bg-[#fbfcfe] p-4"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(form.body || '_Nothing to preview yet._') }}
            />
          ) : (
            <textarea
              className="input min-h-[260px] resize-y font-mono text-[12.5px] leading-relaxed"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="# Context&#10;&#10;Write the decision, the debugging steps, or paste a snippet…"
              spellCheck={false}
            />
          )}
          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-soft">
            <input
              type="checkbox"
              checked={form.pinned}
              onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-[#cbd2dd] text-brand-600 focus:ring-brand-500"
            />
            Pin to the top of the notes list
          </label>
          {formError && (
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-[12px] text-red-700">{formError}</div>
          )}
        </div>
      </Modal>
    </div>
  );
}
