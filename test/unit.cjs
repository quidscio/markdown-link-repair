const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extract } = require('../out/extract');
const { classify } = require('../out/normalize');
const { supportsHost } = require('../out/host');

test('unsupported and remote hosts abstain', () => {
  assert.equal(supportsHost('win32', undefined), true);
  for (const platform of ['darwin', 'linux']) assert.equal(supportsHost(platform, undefined), false);
  for (const remote of ['wsl', 'ssh-remote', 'dev-container']) assert.equal(supportsHost('win32', remote), false);
});

test('native classification precedes relative resolution', () => {
  for (const s of ['C:\\fixtures\\r.html', 'C:/fixtures/r.html', '/C:/fixtures/r.html', 'C:\\100% complete.html', 'C:\\report #1.html']) assert.equal(classify(s), 'drive', s);
  assert.equal(classify('\\\\server\\share\\r.pdf'), 'unc');
  assert.equal(classify('C:report.html'), 'drive-relative');
  assert.equal(classify('C:\\r.html:12:3'), 'ambiguous-native');
  for (const s of ['../r.html', './r.html', '/tmp/r.html', '#heading', 'https://example.com', 'mailto:x@y.com', 'command:x', 'vscode:x']) assert.equal(classify(s), 'untouched');
  assert.equal(classify('file:///C:/r%20%23%25.html#part'), 'file-uri');
});

test('source positions and native characters survive parsing', () => {
  for (const target of ['C:\\q\\report.html', 'C:/r.html', '/C:/r.html', 'C:\\报告\\100% complete #1(2).html', '\\\\server\\share\\r.pdf', 'C:\\dir\\(report).html']) {
    for (const angle of [false, true]) {
      const text = `[Report     ](${angle ? '<' : ''}${target}${angle ? '>' : ''} "title")`;
      const found = extract(text);
      assert.equal(found.length, 1, text);
      assert.equal(found[0].destination, target);
      assert.equal(text.slice(found[0].start, found[0].end), target);
    }
  }
});

test('reference uses share the raw definition destination', () => {
  const text = '[One][report]\n\n[Two][REPORT]\n\n[report]: <C:\\My Reports\\report #1.html> "Title"\n';
  const found = extract(text);
  assert.equal(found.length, 3);
  assert.deepEqual(found.map(c => text.slice(c.start, c.end)), ['[One][report]', '[Two][REPORT]', 'C:\\My Reports\\report #1.html']);
  assert.ok(found.every(c => c.destination === 'C:\\My Reports\\report #1.html'));
});

test('native reference recovery retains offsets for spaces and backslash-parentheses', () => {
  for (const native of ['C:\\My Reports\\100% complete.html', 'C:\\dir\\(report).html']) {
    const text = `[r]: ${native}\n\n[One][r]\n\n[r][]\n\n[r]\n`;
    const found = extract(text);
    assert.equal(found.length, 4, text);
    assert.ok(found.every(c => c.destination === native));
    for (const c of found) assert.equal(text.slice(c.destinationStart, c.destinationEnd), native);
  }
});

test('code, comments, images, examples and ordinary URLs are not claimed', () => {
  const examples = [
    '`[x](C:\\r.html)`', '```markdown\n[x](C:\\r.html)\n```',
    '    [x](C:\\r.html)', '<!-- [x](C:\\r.html) -->',
    '![x](C:\\r.html)', '\\[x](C:\\r.html)', '> [x](C:\\r.html)',
    '[x](file:///C:/r.html)', '[x](../r.html)', '[x](#heading)',
    '[x](https://example.com)', '[x](command:foo)', '[x](mailto:a@b.com)'
  ];
  for (const text of examples) assert.deepEqual(extract(text), [], text);
});

test('cancellation returns no repair links', () => assert.deepEqual(extract('[x](C:\\r.html)', () => true), []));

test('large document work is limited to the current source', () => {
  const text = ('Ordinary text and `code`\r\n\r\n').repeat(10000) + '[x](C:\\r.html)';
  const start = performance.now();
  assert.equal(extract(text).length, 1);
  assert.ok(performance.now() - start < 5000, 'Large fixture exceeds 5 second analysis budget');
});
