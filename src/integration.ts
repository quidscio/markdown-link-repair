import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as assert from 'node:assert/strict';
import { normalize } from './normalize';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export async function run(): Promise<void> {
  const root = process.env.MLR_INTEGRATION_ROOT;
  if (!root) throw new Error('Only run against the controlled fixture directory');
  const checks: string[] = [];
  const report: Record<string, unknown> = { vscode: vscode.version, trusted: vscode.workspace.isTrusted, remote: vscode.env.remoteName ?? null,
    workspaceFolders: vscode.workspace.workspaceFolders?.map(folder => folder.name) };
  const check = async (name: string, fn: () => Promise<void>) => { await fn(); checks.push(name); };
  const targetPath = path.join(root, 'report #1 100% (测试).html');
  await fs.writeFile(targetPath, '<!doctype html><title>Repaired target</title><p>Fixture</p>\n');
  const fixture = path.join(root, 'acceptance.md');
  const source = `[Report padded   ](<${targetPath}> "Title")\r\n\r\n[One][r]\r\n\r\n[Two][r]\r\n\r\n[r]: <${targetPath}>\r\n\r\n[relative](./relative.html) [heading](#heading) [web](https://example.com)\r\n\r\n# Heading\r\n`;
  await fs.writeFile(fixture, source);
  await fs.writeFile(path.join(root, 'relative.html'), '<title>relative</title>');
  const doc = await vscode.workspace.openTextDocument(fixture);
  await vscode.window.showTextDocument(doc);
  const extension = vscode.extensions.getExtension('local.markdown-link-repair');
  assert.ok(extension, 'Production extension is available');
  await extension.activate();
  for (const id of ['vscode.markdown-language-features', 'yzhang.markdown-all-in-one', 'DavidAnson.vscode-markdownlint', 'bierner.markdown-mermaid']) {
    const ext = vscode.extensions.getExtension(id);
    assert.ok(ext, `${id} must remain enabled in the test host`);
    await ext.activate();
  }
  const links = () => vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', doc.uri, 100);
  const follow = async (link: vscode.DocumentLink) => {
    assert.equal(link.target?.scheme, 'command');
    const args = JSON.parse(decodeURIComponent(link.target!.query));
    await vscode.commands.executeCommand(link.target!.path, ...args);
    await pause(150);
  };
  try {
    await pause(1000);
    await check('Windows Uri.file round trips native %, #, Unicode, parentheses, UNC and drive variants', async () => {
      for (const native of ['C:\\fixtures\\r.html', 'C:/fixtures/r.html', '/C:/fixtures/r.html', targetPath, '\\\\server\\share\\r #1%.pdf']) {
        const expected = native.replace(/^\/([a-z]:)/i, '$1').replace(/\//g, '\\');
        const uri = normalize(native, vscode.Uri)!;
        assert.equal(vscode.Uri.parse(uri.toString()).fsPath.toLowerCase(), expected.toLowerCase());
      }
      const encoded = 'file:///C:/fixtures/a%20b%23c%25d.html#fragment';
      const parsed = normalize(encoded, vscode.Uri)!;
      assert.equal(parsed.fragment, 'fragment');
      assert.equal(parsed.path.toLowerCase(), '/c:/fixtures/a b#c%d.html');
      assert.equal(vscode.Uri.parse(parsed.toString()).path.toLowerCase(), parsed.path.toLowerCase());
    });
    await check('Merged links contain exactly four repaired ranges and preserve ordinary links', async () => {
      const all = await links();
      const repaired = all.filter(link => link.target?.path === 'markdownLinkRepair.follow');
      assert.equal(repaired.length, 4);
      assert.ok(all.length >= 7);
      report.combinedLinks = all.map(link => ({ range: [link.range.start.line, link.range.start.character, link.range.end.line, link.range.end.character], scheme: link.target?.scheme, command: link.target?.scheme === 'command' ? link.target.path : undefined }));
    });
    await check('Following a repaired link opens intended target exactly once and leaves CRLF disk/editor clean', async () => {
      const opened: string[] = [];
      const listener = vscode.workspace.onDidOpenTextDocument(d => opened.push(d.uri.toString()));
      try {
        await follow((await links()).find(link => link.target?.path === 'markdownLinkRepair.follow')!);
        assert.deepEqual(opened, [vscode.Uri.file(targetPath).toString()]);
        assert.equal(doc.getText(), source); assert.equal(doc.isDirty, false); assert.equal(doc.version, 1);
        assert.equal(await fs.readFile(fixture, 'utf8'), source);
      } finally { listener.dispose(); }
    });
    await check('Repeated references open the same target; unsaved edits remain unchanged', async () => {
      const edit = new vscode.WorkspaceEdit(); edit.insert(doc.uri, new vscode.Position(0, 0), 'Unsaved note\r\n\r\n');
      await vscode.workspace.applyEdit(edit);
      const version = doc.version, text = doc.getText();
      const repaired = (await links()).filter(link => link.target?.path === 'markdownLinkRepair.follow');
      for (const link of repaired.slice(1, 3)) await follow(link);
      assert.equal(doc.getText(), text); assert.equal(doc.version, version); assert.equal(doc.isDirty, true);
      assert.equal(await fs.readFile(fixture, 'utf8'), source);
    });
    await check('Editor follow-link routing chooses repaired reference identifiers despite overlapping links', async () => {
      for (const line of [4, 6, 8]) {
        for (const group of vscode.window.tabGroups.all) {
          for (const tab of group.tabs) {
            if (tab.input instanceof vscode.TabInputText && tab.input.uri.toString() === vscode.Uri.file(targetPath).toString()) await vscode.window.tabGroups.close(tab);
          }
        }
        const editor = await vscode.window.showTextDocument(doc);
        const position = new vscode.Position(line, line === 8 ? 12 : 6);
        editor.selection = new vscode.Selection(position, position);
        await pause(1600);
        await vscode.commands.executeCommand('editor.action.openLink');
        await pause(500);
        const active = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
        assert.ok(active instanceof vscode.TabInputText, `Reference line ${line} opens a text target`);
        assert.equal(active.uri.toString(), vscode.Uri.file(targetPath).toString(), `Reference line ${line} routes to the repaired target`);
      }
    });
    await check('Missing file creates neither tab, directory nor placeholder', async () => {
      const missingPath = path.join(root, 'does-not-exist', 'missing.html');
      const missingFixture = path.join(root, 'missing.md');
      await fs.writeFile(missingFixture, `[missing](${missingPath})`);
      const missingDoc = await vscode.workspace.openTextDocument(missingFixture);
      await vscode.window.showTextDocument(missingDoc);
      const all = await vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', missingDoc.uri, 100);
      await follow(all.find(link => link.target?.path === 'markdownLinkRepair.follow')!);
      assert.equal(vscode.workspace.textDocuments.some(d => d.uri.fsPath === missingPath), false);
      await assert.rejects(fs.access(path.dirname(missingPath)));
      assert.equal(missingDoc.isDirty, false);
    });
    await check('PDF uses the same configured custom editor as an explicit file URI', async () => {
      const pdfPath = path.join(root, 'viewer.pdf');
      const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>', '<< /Length 0 >>\nstream\n\nendstream'];
      let pdf = '%PDF-1.4\n'; const offsets = [0];
      for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
      const xref = Buffer.byteLength(pdf);
      pdf += 'xref\n0 5\n0000000000 65535 f \n' + offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
      pdf += `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      await fs.writeFile(pdfPath, pdf);
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(pdfPath));
      await pause(500);
      const ordinary = vscode.window.tabGroups.activeTabGroup.activeTab!;
      const input = ordinary.input;
      assert.ok(input instanceof vscode.TabInputCustom, 'Installed PDF viewer should own the normal open');
      const viewType = input.viewType;
      assert.equal(viewType, 'pdf.preview');
      await vscode.window.tabGroups.close(ordinary);
      const pdfFixture = path.join(root, 'pdf.md');
      await fs.writeFile(pdfFixture, `[PDF](${pdfPath})`);
      const pdfDoc = await vscode.workspace.openTextDocument(pdfFixture);
      await vscode.window.showTextDocument(pdfDoc);
      const all = await vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', pdfDoc.uri, 100);
      await follow(all.find(link => link.target?.path === 'markdownLinkRepair.follow')!);
      const repairedInput = vscode.window.tabGroups.activeTabGroup.activeTab!.input;
      assert.ok(repairedInput instanceof vscode.TabInputCustom);
      assert.equal(repairedInput.viewType, viewType);
      assert.equal(repairedInput.uri.toString(), vscode.Uri.file(pdfPath).toString());
      report.pdfViewType = viewType;
    });
    await check('Disable setting removes only this provider; re-enable restores it', async () => {
      const config = vscode.workspace.getConfiguration('markdownLinkRepair', doc);
      try {
        await config.update('enabled', false, vscode.ConfigurationTarget.Workspace);
        assert.equal((await links()).filter(link => link.target?.path === 'markdownLinkRepair.follow').length, 0);
        assert.ok((await links()).length > 0);
      } finally { await config.update('enabled', undefined, vscode.ConfigurationTarget.Workspace); }
      assert.equal((await links()).filter(link => link.target?.path === 'markdownLinkRepair.follow').length, 4);
    });
    await check('Loose LF Markdown source opens an outside-workspace absolute target', async () => {
      const loosePath = path.join(path.dirname(root), 'loose-acceptance.md');
      const outsidePath = path.join(path.dirname(root), 'outside-target.html');
      await fs.writeFile(outsidePath, '<title>Outside workspace</title>');
      const original = `[outside](${outsidePath})\n\nUnsaved-note test follows.\n`;
      await fs.writeFile(loosePath, original);
      const loose = await vscode.workspace.openTextDocument(loosePath);
      await vscode.window.showTextDocument(loose);
      const version = loose.version;
      const all = await vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', loose.uri, 100);
      await follow(all.find(link => link.target?.path === 'markdownLinkRepair.follow')!);
      const active = vscode.window.tabGroups.activeTabGroup.activeTab!.input;
      assert.ok(active instanceof vscode.TabInputText);
      assert.equal(active.uri.toString(), vscode.Uri.file(outsidePath).toString());
      assert.equal(loose.version, version); assert.equal(loose.isDirty, false);
      assert.equal(loose.getText(), original); assert.equal(await fs.readFile(loosePath, 'utf8'), original);
    });
    await check('Nondefault Windows-1252 encoding and CRLF bytes survive follow-link', async () => {
      const encodedPath = path.join(root, 'windows1252.md');
      const encodedUri = vscode.Uri.file(encodedPath);
      const files = vscode.workspace.getConfiguration('files', encodedUri);
      const asciiTarget = path.join(root, 'encoding.html');
      await fs.writeFile(asciiTarget, '<title>Encoding fixture</title>');
      const bytes = Buffer.from(`[é](<${asciiTarget}>)\r\n`, 'latin1');
      await fs.writeFile(encodedPath, bytes);
      try {
        await files.update('encoding', 'windows1252', vscode.ConfigurationTarget.WorkspaceFolder);
        const encoded = await vscode.workspace.openTextDocument(encodedUri);
        assert.ok(encoded.getText().startsWith('[é]'));
        await vscode.window.showTextDocument(encoded);
        const text = encoded.getText(), version = encoded.version;
        const all = await vscode.commands.executeCommand<vscode.DocumentLink[]>('vscode.executeLinkProvider', encodedUri, 100);
        await follow(all.find(link => link.target?.path === 'markdownLinkRepair.follow')!);
        assert.equal(encoded.getText(), text); assert.equal(encoded.version, version); assert.equal(encoded.isDirty, false);
        assert.deepEqual(await fs.readFile(encodedPath), bytes);
      } finally { await files.update('encoding', undefined, vscode.ConfigurationTarget.WorkspaceFolder); }
    });
    report.extensions = ['vscode.markdown-language-features', 'yzhang.markdown-all-in-one', 'DavidAnson.vscode-markdownlint',
      'bierner.markdown-mermaid', 'openai.chatgpt', 'Anthropic.claude-code', 'tomoki1207.pdf'].map(id => {
      const ext = vscode.extensions.getExtension(id); return { id, availableInHost: !!ext, version: ext?.packageJSON.version, active: ext?.isActive };
    });
  } catch (error) { report.error = String(error); throw error;
  } finally {
    report.checks = checks;
    await fs.writeFile(path.join(root, 'integration-result.json'), JSON.stringify(report, null, 2));
  }
}
