import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, plainText } from '../src/lib/markdown.js';
import { relativeTime, formatDuration, formatUptime, dueLabel, initials } from '../src/lib/format.js';
import { qs } from '../src/lib/api.js';

test('markdown renders headings, lists and inline styles', () => {
  const html = renderMarkdown('# Title\n\nSome **bold** and *italic* text.\n\n- one\n- two');
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<ul>\n<li>one<\/li>\n<li>two<\/li>\n<\/ul>/);
});

test('markdown escapes raw HTML (no injection)', () => {
  const html = renderMarkdown('<script>alert(1)</script>');
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
});

test('markdown renders fenced code blocks with language', () => {
  const html = renderMarkdown('```python\nprint("hi")\n```');
  assert.match(html, /<pre><code data-lang="python">print\(&quot;hi&quot;\)<\/code><\/pre>/);
});

test('markdown renders tables and blockquotes', () => {
  const html = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |\n\n> quoted wisdom');
  assert.match(html, /<table>/);
  assert.match(html, /<td>1<\/td>/);
  assert.match(html, /<blockquote>quoted wisdom<\/blockquote>/);
});

test('markdown links open safely', () => {
  const html = renderMarkdown('[docs](https://example.com/x)');
  assert.match(html, /rel="noreferrer noopener"/);
});

test('plainText strips markdown for previews', () => {
  const text = plainText('# Heading\n\nA **bold** idea with `code`.', 40);
  assert.ok(!text.includes('#'));
  assert.ok(!text.includes('**'));
  assert.ok(text.length <= 41);
});

test('relativeTime produces human labels', () => {
  assert.equal(relativeTime(new Date().toISOString()), 'just now');
  assert.match(relativeTime(Date.now() - 5 * 60_000), /minutes ago/);
  assert.match(relativeTime(Date.now() - 3 * 3_600_000), /hours ago/);
  assert.match(relativeTime(Date.now() + 2 * 86_400_000), /in 2 days/);
});

test('formatDuration switches units', () => {
  assert.equal(formatDuration(42), '42ms');
  assert.equal(formatDuration(3412), '3.41s');
  assert.equal(formatDuration(75_000), '1m 15s');
  assert.equal(formatDuration(null), '—');
});

test('formatUptime and initials', () => {
  assert.equal(formatUptime(3 * 3_600_000 + 60_000), '3h 1m');
  assert.equal(formatUptime(2 * 86_400_000), '2d 0h');
  assert.equal(initials('Alex Rivera'), 'AR');
  assert.equal(initials('priya'), 'P');
});

test('dueLabel flags overdue and due-today tasks', () => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  assert.equal(dueLabel(yesterday, 'todo').tone, 'danger');
  assert.equal(dueLabel(new Date().toISOString(), 'todo').text, 'Due today');
  assert.equal(dueLabel(new Date().toISOString(), 'done').tone, 'neutral');
  assert.equal(dueLabel(null, 'todo'), null);
});

test('qs skips empty values and joins arrays', () => {
  assert.equal(qs({ a: 1, b: '', c: null, d: undefined }), '?a=1');
  assert.equal(qs({ status: ['todo', 'done'] }), '?status=todo%2Cdone');
  assert.equal(qs({}), '');
});
