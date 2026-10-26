import * as vscode from 'vscode';

// Deliberately not activated in normal use. The feasibility test explicitly registers
// this one-fixture provider; this is not the production Markdown parser.
export async function activate(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (folder && /[\\/]\.gate-runtime[\\/](manual-|live-)?(early|late)$/.test(folder)) {
    const fs = await import('node:fs/promises');
    try {
      await fs.access(folder + '/run-live-gate');
      const gate = await import('./gate');
      await gate.runGate(folder, folder.endsWith('early') ? 'early' : 'late');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.error('Link repair live gate:', error);
    }
  }
}

export function registerProbe(uri: vscode.Uri, text: string): vscode.Disposable {
  const start = text.indexOf('C:\\');
  const end = text.indexOf(')', start);
  if (start < 0 || end < 0) throw new Error('Expected the controlled Windows fixture');
  const range = new vscode.Range(0, start, 0, end);
  const target = vscode.Uri.file(text.slice(start, end));
  return vscode.languages.registerDocumentLinkProvider(
    { language: 'markdown', scheme: 'file', pattern: '**/*.md' },
    { provideDocumentLinks(candidate) {
      return candidate.uri.toString() === uri.toString()
        ? [new vscode.DocumentLink(range, target)] : [];
    } }
  );
}
