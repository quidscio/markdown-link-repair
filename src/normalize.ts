import type { Uri } from 'vscode';

export type Classification = 'drive' | 'unc' | 'file-uri' | 'drive-relative' | 'ambiguous-native' | 'untouched';

export function classify(destination: string): Classification {
  if (/^file:\/\//i.test(destination)) return 'file-uri';
  if (/^\/?[a-z]:[\\/]/i.test(destination)) {
    const rest = destination.replace(/^\/?[a-z]:/i, '');
    return /[\x00-\x1f<>:"|?*]/.test(rest) ? 'ambiguous-native' : 'drive';
  }
  if (/^\\\\[^\\/]+[\\/][^\\/]+/.test(destination)) {
    return /[\x00-\x1f<>:"|?*]/.test(destination) ? 'ambiguous-native' : 'unc';
  }
  if (/^[a-z]:/i.test(destination)) return 'drive-relative';
  return 'untouched';
}

// URI construction stays in the VS Code API. The injected factory lets the pure
// classification module load outside an extension host without mocking vscode.
export function normalize(destination: string, uri: Pick<typeof Uri, 'file' | 'parse'>): Uri | undefined {
  switch (classify(destination)) {
    case 'drive': return uri.file(destination.replace(/^\/([a-z]:)/i, '$1'));
    case 'unc': return uri.file(destination);
    case 'file-uri': return uri.parse(destination, true);
    default: return undefined;
  }
}
