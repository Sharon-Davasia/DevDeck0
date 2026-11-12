import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import {
  Badge,
  Button,
  CodeBlock,
  Drawer,
  ErrorState,
  IconButton,
  Modal,
  Select,
  Skeleton,
  Tooltip,
  useConfirm,
} from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { useToast } from '../lib/ToastContext.jsx';
import { NOTE_KIND, formatDateTime, relativeTime } from '../lib/format.js';
import { renderMarkdown } from '../lib/markdown.js';
import { useRealtime } from '../lib/realtime.js';

export default function NoteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: note, loading, error, refresh, setData } = useApi(`/notes/${id}`);
  const { data: projects } = useApi('/projects?status=all', { initialData: [] });

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [kind, setKind] = useState('note');
  const [projectId, setProjectId] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState('preview');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingRevision, setViewingRevision] = useState(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!note) return;
    setTitle(note.title);
    setBody(note.body);
    setTags((note.tags || []).join(', '));
    setKind(note.kind);
    setProjectId(note.projectId || '');
    setDirty(false);
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before losing unsaved edits.
  useEffect(() => {
    const handler = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Auto-save after the user stops typing (2s), like a real note app.
  useEffect(() => {
    if (!dirty) return undefined;
    const t = setTimeout(() => save({ silent: true }), 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, tags, kind, projectId, dirty]);

  async function save({ silent = false } = {}) {
    if (!note) return;
    setSaving(true);
    try {
      const res = await api.patch(`/notes/${note.id}`, {
        title: title.trim() || 'Untitled note',
        body,
        tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
        kind,
        projectId: projectId || null,
      });
      setData((prev) => ({ ...prev, ...res.data }));
      setDirty(false);
      if (!silent) toast.success('Note saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function togglePin() {
    const next = !note.pinned;
    setData((prev) => ({ ...prev, pinned: next }));
    try {
      await api.patch(`/notes/${note.id}`, { pinned: next });
      toast.success(next ? 'Pinned' : 'Unpinned');
    } catch (err) {
      toast.error(err.message);
      refresh({ silent: true });
    }
  }

  async function remove() {
    const ok = await confirm({ title: `Delete “${note.title}”?`, confirmLabel: 'Delete note' });
    if (!ok) return;
    try {
      await api.del(`/notes/${note.id}`);
      toast.success('Note deleted');
      navigate('/notes');
    } catch (err) {
      toast.error(err.message);
    }
  }

  const html = useMemo(() => renderMarkdown(note?.body || ''), [note?.body]);
  const kindMeta = NOTE_KIND[kind] || NOTE_KIND.note;

  if (loading && !note) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
        <div className="card mt-4 space-y-2 p-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className={`h-3 ${i % 3 === 2 ? 'w-2/3' : 'w-full'}`} />
          ))}
        </div>
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={() => refresh()} />;
  if (!note) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <nav className="mb-3 flex items-center gap-1.5 text-[12px] text-muted">
        <Link to="/notes" className="transition-colors hover:text-ink">
          Notes
        </Link>
        <Icon name="chevron-right" size={11} />
        <span className="truncate font-medium text-soft">{note.title}</span>
      </nav>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            value={kind}
            onChange={(v) => {
              setKind(v);
              setDirty(true);
            }}
            size="sm"
            className="min-w-[120px]"
            options={Object.entries(NOTE_KIND).map(([v, k]) => ({ value: v, label: k.label }))}
          />
          <Select
            value={projectId}
            onChange={(v) => {
              setProjectId(v);
              setDirty(true);
            }}
            size="sm"
            className="min-w-[140px]"
            options={[
              { value: '', label: 'No project' },
              ...(projects || []).map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <Badge className={note.pinned ? 'bg-amber-50 text-amber-700' : 'bg-line-soft text-muted'}>
            {note.pinned ? 'Pinned' : 'Unpinned'}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-[11px] ${saving ? 'text-brand-600' : dirty ? 'text-amber-600' : 'text-muted'}`}>
            {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved'}
          </span>
          <Button
            variant="secondary"
            size="sm"
            icon="clock"
            onClick={() => setHistoryOpen(true)}
          >
            History {note.revisions?.length ? `(${note.revisions.length})` : ''}
          </Button>
          <Tooltip label={note.pinned ? 'Unpin' : 'Pin'}>
            <IconButton icon="pin" label="Pin note" onClick={togglePin} />
          </Tooltip>
          <Tooltip label="Delete">
            <IconButton icon="trash" label="Delete note" onClick={remove} className="hover:text-red-600" />
          </Tooltip>
          <Button variant="primary" size="sm" icon="save" onClick={() => save()} disabled={!dirty}>
            Save
          </Button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="border-b border-line-soft px-5 py-4">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            className="w-full border-0 bg-transparent text-[20px] font-bold tracking-[-0.02em] text-ink outline-none placeholder:text-muted/60"
            placeholder="Untitled note"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
            <span className="flex items-center gap-1">
              <Icon name="clock" size={10} /> updated {relativeTime(note.updatedAt)}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="calendar" size={10} /> created {formatDateTime(note.createdAt)}
            </span>
            <input
              value={tags}
              onChange={(e) => {
                setTags(e.target.value);
                setDirty(true);
              }}
              placeholder="add tags…"
              className="min-w-[120px] flex-1 border-0 bg-transparent text-[11px] text-soft outline-none placeholder:text-muted/70"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 border-b border-line-soft bg-[#fbfcfe] px-3 py-1.5">
          <button
            onClick={() => setMode('preview')}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors ${
              mode === 'preview' ? 'bg-surface text-ink shadow-card ring-1 ring-line' : 'text-muted hover:text-ink'
            }`}
          >
            <Icon name="eye" size={12} /> Preview
          </button>
          <button
            onClick={() => {
              setMode('edit');
              setTimeout(() => textareaRef.current?.focus(), 30);
            }}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors ${
              mode === 'edit' ? 'bg-surface text-ink shadow-card ring-1 ring-line' : 'text-muted hover:text-ink'
            }`}
          >
            <Icon name="edit" size={12} /> Edit
          </button>
          <span className="ml-auto text-[10.5px] text-muted">
            {body.length} chars · markdown
          </span>
        </div>

        {mode === 'preview' ? (
          <div
            className="prose-devdeck min-h-[320px] px-5 py-5"
            dangerouslySetInnerHTML={{ __html: html || '<p class="text-muted">This note is empty. Switch to Edit to start writing.</p>' }}
          />
        ) : (
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setDirty(true);
            }}
            className="min-h-[380px] w-full resize-y border-0 bg-transparent px-5 py-4 font-mono text-[12.5px] leading-[1.75] text-soft outline-none"
            placeholder="# Heading&#10;&#10;Write markdown here…"
            spellCheck={false}
          />
        )}
      </div>

      <p className="mt-2 text-center text-[10.5px] text-muted">
        Changes save automatically · last {note.revisions?.length || 0} revisions kept
      </p>

      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} title="Version history">
        {!note.revisions?.length ? (
          <p className="text-[12.5px] text-muted">
            No snapshots yet. Revisions are captured each time you save a changed body.
          </p>
        ) : (
          <ul className="space-y-2">
            {note.revisions.map((rev) => (
              <li key={rev.id} className="rounded-xl border border-line p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-semibold text-ink">{rev.title}</p>
                    <p className="text-[11px] text-muted">{formatDateTime(rev.createdAt)}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setViewingRevision(rev)}>
                    View
                  </Button>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[11px] text-muted">{rev.body.slice(0, 140)}</p>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      <Modal
        open={Boolean(viewingRevision)}
        onClose={() => setViewingRevision(null)}
        title={viewingRevision?.title}
        description={viewingRevision ? formatDateTime(viewingRevision.createdAt) : ''}
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setViewingRevision(null)}>
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="refresh"
              onClick={() => {
                setBody(viewingRevision.body);
                setTitle(viewingRevision.title);
                setDirty(true);
                setViewingRevision(null);
                setHistoryOpen(false);
                setMode('edit');
                toast.info('Revision restored into the editor — save to keep it');
              }}
            >
              Restore this version
            </Button>
          </>
        }
      >
        <div className="prose-devdeck" dangerouslySetInnerHTML={{ __html: renderMarkdown(viewingRevision?.body || '') }} />
      </Modal>
    </div>
  );
}
