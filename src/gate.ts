import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as assert from 'node:assert/strict';
import { registerProbe } from './prototype';

const relevant = [
  'vscode.markdown-language-features', 'yzhang.markdown-all-in-one',
  'DavidAnson.vscode-markdownlint', 'bierner.markdown-mermaid',
  'openai.chatgpt', 'Anthropic.claude-code', 'tomoki1207.pdf',
  'streetsidesoftware.code-spell-checker', 'fukuchiharuki.paragraph-writing-support',
  'jebbs.plantuml', 'EFanZh.graphviz-preview'
];
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function run(): Promise<void> { await runGate(); }

export async function runGate(liveRoot?: string, liveOrder?: string): Promise<void> {
  const root = liveRoot ?? process.env.MLR_GATE_ROOT;
  const order = liveOrder ?? process.env.MLR_GATE_ORDER;
  if (!root) throw new Error('MLR_GATE_ROOT is required');
  const report: Record<string, unknown> = {
    vscode: vscode.version, platform: process.platform, remoteName: vscode.env.remoteName ?? null,
    trusted: vscode.workspace.isTrusted,
    mode: order, interactive: !!liveRoot,
    liveProfile: !!liveRoot && path.basename(root).startsWith('live-'), started: new Date().toISOString(),
    extensions: relevant.map(id => {
      const ext = vscode.extensions.getExtension(id);
      return { id, availableInHost: !!ext, version: ext?.packageJSON.version, active: ext?.isActive };
    })
  };
  const fixture = vscode.Uri.file(path.join(root, 'fixture.md'));
  const source = await fs.readFile(fixture.fsPath, 'utf8');
  let probe: vscode.Disposable | undefined;
  if (order === 'early') probe = registerProbe(fixture, source);
  const doc = await vscode.workspace.openTextDocument(fixture);
  const before = doc.getText();
  const snapshot = async () => (await vscode.commands.executeCommand<vscode.DocumentLink[]>(
    'vscode.executeLinkProvider', fixture, 100
  ))?.map(link => ({ range: [link.range.start.line, link.range.start.character,
    link.range.end.line, link.range.end.character], target: link.target?.toString() }));
  try {
    await vscode.window.showTextDocument(doc);
    for (const id of relevant.slice(0, 4)) {
      const ext = vscode.extensions.getExtension(id);
      if (ext) await ext.activate();
    }
    await delay(4000);
    report.beforeLateRegistration = await snapshot();
    if (!probe) probe = registerProbe(fixture, source);
    await delay(1500);
    report.withProbe = await snapshot();
    report.expected = vscode.Uri.file(path.join(root, 'target.html')).toString();
    assert.equal((report.withProbe as {target?: string}[]).length, 1);
    assert.equal((report.withProbe as {target?: string}[])[0].target, report.expected);
    for (const id of relevant.slice(0, 4)) assert.ok(vscode.extensions.getExtension(id)?.isActive, `${id} must be active`);
    report.extensionsAfter = relevant.map(id => {
      const ext = vscode.extensions.getExtension(id);
      return { id, availableInHost: !!ext, version: ext?.packageJSON.version, active: ext?.isActive };
    });
    report.sourceUnchanged = before === doc.getText();
    report.dirty = doc.isDirty;
    assert.equal(doc.isDirty, false); assert.equal(before, doc.getText());
    if (liveRoot) {
      const events: unknown[] = [];
      const writeGesture = async () => {
        await fs.writeFile(path.join(root, 'gesture.json'), JSON.stringify({
          events, sourceUnchanged: before === doc.getText(), dirty: doc.isDirty,
          sourceVersion: doc.version,
          diskUnchanged: source === await fs.readFile(fixture.fsPath, 'utf8'),
          tabs: vscode.window.tabGroups.all.flatMap(group => group.tabs.map(tab => ({
            label: tab.label, input: tab.input instanceof vscode.TabInputText ? tab.input.uri.toString() : String(tab.input)
          })))
        }, null, 2));
      };
      vscode.workspace.onDidOpenTextDocument(opened => {
        events.push({ type: 'documentOpened', uri: opened.uri.toString() });
        void writeGesture();
      });
      vscode.window.tabGroups.onDidChangeTabs(event => {
        events.push({ type: 'tabsChanged', opened: event.opened.map(tab => tab.label) });
        void writeGesture();
      });
      await writeGesture();
      report.awaitingManualCtrlClick = true;
      // Keep the test provider registered for a real gesture. Closing this development
      // window removes it. No automatic opener or gesture substitute is invoked.
      probe = undefined;
      return;
    }
    probe.dispose(); probe = undefined;
    report.afterDisposal = await snapshot();
  } catch (error) { report.error = String(error); throw error;
  } finally {
    probe?.dispose();
    await fs.writeFile(path.join(root, 'result.json'), JSON.stringify(report, null, 2));
  }
}
