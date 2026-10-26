import * as vscode from 'vscode';
import { extract, Candidate } from './extract';
import { classify, normalize } from './normalize';
import { supportsHost } from './host';

const namespace = 'markdownLinkRepair';
const follow = namespace + '.follow';
const supported = () => supportsHost(process.platform, vscode.env.remoteName);
const enabled = (doc: vscode.TextDocument) => supported() && doc.uri.scheme === 'file'
  && doc.languageId === 'markdown' && vscode.workspace.getConfiguration(namespace, doc).get<boolean>('enabled', true);
interface FollowRequest { document: string; start: number; end: number; destination: string }

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Markdown Link Repair');
  const debug = (message: string) => {
    if (vscode.workspace.getConfiguration(namespace).get<boolean>('debug', false)) output.appendLine(message);
  };
  const cache = new Map<string, { version: number; candidates: Candidate[] }>();
  const candidates = (doc: vscode.TextDocument, token?: vscode.CancellationToken) => {
    const key = doc.uri.toString();
    const previous = cache.get(key);
    if (previous?.version === doc.version) return previous.candidates;
    const found = extract(doc.getText(), () => token?.isCancellationRequested ?? false);
    if (!token?.isCancellationRequested) cache.set(key, { version: doc.version, candidates: found });
    return found;
  };
  let provider: vscode.Disposable | undefined;
  const register = () => {
    provider?.dispose(); cache.clear();
    provider = vscode.languages.registerDocumentLinkProvider(
      { language: 'markdown', scheme: 'file', pattern: '**/*' },
      { async provideDocumentLinks(doc, token) {
        if (!enabled(doc) || token.isCancellationRequested) return [];
        // Yield before analysis so superseded requests can be cancelled. VS Code
        // debounces document-link requests; only this document/version is scanned.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        if (token.isCancellationRequested) return [];
        const links = candidates(doc, token).filter(c => ['drive', 'unc'].includes(classify(c.destination))).map(c => {
          const request: FollowRequest = { document: doc.uri.toString(), start: c.start, end: c.end, destination: c.destination };
          const target = vscode.Uri.from({ scheme: 'command', path: follow, query: encodeURIComponent(JSON.stringify([request])) });
          const link = new vscode.DocumentLink(new vscode.Range(doc.positionAt(c.start), doc.positionAt(c.end)), target);
          link.tooltip = `Open ${normalize(c.destination, vscode.Uri)?.fsPath}`;
          return link;
        });
        debug(`Analyzed version ${doc.version}: ${links.length} native file links`);
        return links;
      } }
    );
  };
  register();
  context.subscriptions.push(output, { dispose() { provider?.dispose(); } },
    vscode.workspace.onDidCloseTextDocument(doc => cache.delete(doc.uri.toString())),
    vscode.workspace.onDidChangeConfiguration(event => { if (event.affectsConfiguration(namespace)) register(); }),
    vscode.commands.registerCommand(follow, async (request: FollowRequest) => {
      try {
        if (!request || typeof request.document !== 'string' || typeof request.destination !== 'string'
          || !Number.isInteger(request.start) || !Number.isInteger(request.end)) throw new Error('Invalid link request.');
        const sourceUri = vscode.Uri.parse(request.document, true);
        // Never open an arbitrary source provided by a command URI. A provider link
        // must refer to an already-open supported Markdown document.
        const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === sourceUri.toString());
        if (!doc || !enabled(doc)) throw new Error('Link repair is unavailable in this document or host.');
        const candidate = candidates(doc).find(c => c.start === request.start && c.end === request.end && c.destination === request.destination);
        if (!candidate) throw new Error('The link changed. Ctrl+click the current link again.');
        if (!['drive', 'unc'].includes(classify(candidate.destination))) throw new Error('Ambiguous native path.');
        const target = normalize(candidate.destination, vscode.Uri)!;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          const stat = await Promise.race([
            vscode.workspace.fs.stat(target),
            new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('File access timed out (5 seconds).')), 5000); })
          ]);
          if (stat.type & vscode.FileType.Directory) throw new Error('The destination is a directory, not a file.');
        } catch (error) {
          throw new Error(`Cannot open ${target.toString()}: ${error instanceof Error ? error.message : String(error)}`);
        } finally { if (timeout) clearTimeout(timeout); }
        await vscode.commands.executeCommand('vscode.open', target);
      } catch (error) { void vscode.window.showErrorMessage(`Markdown Link Repair: ${error instanceof Error ? error.message : String(error)}`); }
    }),
    vscode.commands.registerCommand(namespace + '.diagnose', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || doc.languageId !== 'markdown') { void vscode.window.showInformationMessage('Open a Markdown source document first.'); return; }
      const ids = ['vscode.markdown-language-features', 'yzhang.markdown-all-in-one', 'DavidAnson.vscode-markdownlint',
        'bierner.markdown-mermaid', 'openai.chatgpt', 'Anthropic.claude-code', 'tomoki1207.pdf'];
      output.appendLine(JSON.stringify({
        vscode: vscode.version, platform: process.platform, remote: vscode.env.remoteName ?? null,
        scheme: doc.uri.scheme, supported: supported(), enabled: enabled(doc),
        extensions: ids.map(id => { const ext = vscode.extensions.getExtension(id); return {
          id, availableInHost: !!ext, version: ext?.packageJSON.version, active: ext?.isActive
        }; }),
        links: candidates(doc).map(c => ({ range: [doc.positionAt(c.start), doc.positionAt(c.end)],
          destination: c.destination, classification: classify(c.destination), normalized: normalize(c.destination, vscode.Uri)?.toString() })),
        note: 'Available in host is distinct from active. Combined links do not identify provider ownership.'
      }, null, 2));
      output.show(true);
    })
  );
}
