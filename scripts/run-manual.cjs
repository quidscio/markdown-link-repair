const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const fixture = path.join(root, '.gate-runtime', 'production-manual');
const companion = path.join(root, '.gate-runtime', 'observer');
const live = process.argv.includes('--live');
fs.mkdirSync(fixture, { recursive: true });
fs.mkdirSync(companion, { recursive: true });
fs.copyFileSync(path.join(root, 'out', 'manual.js'), path.join(companion, 'manual.js'));
fs.writeFileSync(path.join(companion, 'package.json'), JSON.stringify({ name: 'markdown-link-repair-observer', publisher: 'local', version: '0.0.1',
  engines: { vscode: '^1.143.0' }, main: './manual.js', activationEvents: ['*'], extensionDependencies: ['local.markdown-link-repair'] }));
fs.writeFileSync(path.join(fixture, 'target.html'), '<!doctype html><title>Production gesture target</title><p>Success</p>\n');
fs.writeFileSync(path.join(fixture, 'reference.html'), '<!doctype html><title>Reference target</title><p>Reference success</p>\n');
fs.writeFileSync(path.join(fixture, 'gesture.md'), `[Report](${path.join(fixture, 'target.html')})\r\n\r\n[Reference][r]\r\n\r\n[r]: ${path.join(fixture, 'reference.html')}\r\n`);
const executable = process.env.VSCODE_EXE || path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe');
const args = ['--new-window', '--skip-welcome', '--skip-release-notes',
  `--extensions-dir=${path.join(process.env.USERPROFILE, '.vscode', 'extensions')}`,
  `--extensionDevelopmentPath=${root}`, `--extensionDevelopmentPath=${companion}`,
  ...(live ? [] : ['--disable-workspace-trust', `--user-data-dir=${path.join(root, '.gate-runtime', 'production-manual-profile')}`]), fixture];
spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref();
console.log(`Opened production manual fixture in ${live ? 'live' : 'temporary all-enabled'} profile.`);
