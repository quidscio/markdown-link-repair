export function supportsHost(platform: string, remoteName: string | undefined): boolean {
  return platform === 'win32' && !remoteName;
}
