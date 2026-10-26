// Test-only companion extension. Packaged separately by run-manual.cjs, never in VSIX.
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!folder || !folder.endsWith('production-manual')) return;
  const fixture = path.join(folder, 'gesture.md');
  const doc = await vscode.workspace.openTextDocument(fixture);
  const before = doc.getText();
  const version = doc.version;
  const events: unknown[] = [];
  const record = async () => {
    await fs.writeFile(path.join(folder, 'manual-result.json'), JSON.stringify({
      vscode: vscode.version, trusted: vscode.workspace.isTrusted,
      events, unchanged: doc.getText() === before, versionUnchanged: doc.version === version,
      dirty: doc.isDirty, diskUnchanged: await fs.readFile(fixture, 'utf8') === before,
      tabs: vscode.window.tabGroups.all.flatMap(g => g.tabs.map(t => ({ label: t.label,
        uri: t.input instanceof vscode.TabInputText || t.input instanceof vscode.TabInputCustom ? t.input.uri.toString() : undefined }))),
      extensions: ['vscode.markdown-language-features', 'yzhang.markdown-all-in-one', 'DavidAnson.vscode-markdownlint', 'bierner.markdown-mermaid',
        'openai.chatgpt', 'Anthropic.claude-code', 'tomoki1207.pdf'].map(id => {
        const e = vscode.extensions.getExtension(id); return { id, availableInHost: !!e, active: e?.isActive, version: e?.packageJSON.version };
      })
    }, null, 2));
  };
  let pending = Promise.resolve();
  const write = () => { pending = pending.then(record); };
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(d => { events.push({ openedDocument: d.uri.toString() }); write(); }),
    vscode.window.tabGroups.onDidChangeTabs(e => { events.push({ openedTabs: e.opened.map(t => t.label) }); write(); })
  );
  await vscode.window.showTextDocument(doc);
  await vscode.extensions.getExtension('local.markdown-link-repair')?.activate();
  for (const id of ['vscode.markdown-language-features', 'yzhang.markdown-all-in-one', 'DavidAnson.vscode-markdownlint', 'bierner.markdown-mermaid']) {
    await vscode.extensions.getExtension(id)?.activate();
  }
  await record();
}
