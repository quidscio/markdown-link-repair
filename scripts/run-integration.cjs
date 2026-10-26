const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const executable = process.env.VSCODE_EXE || path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe');
const fixture = path.join(root, '.gate-runtime', 'integration');
const profile = path.join(root, '.gate-runtime', 'integration-profile');
fs.mkdirSync(fixture, { recursive: true });
let workspace = fixture;
if (process.argv.includes('--multi-root')) {
  const second = path.join(root, '.gate-runtime', 'second-root');
  fs.mkdirSync(second, { recursive: true });
  workspace = path.join(root, '.gate-runtime', 'multi-root.code-workspace');
  fs.writeFileSync(workspace, JSON.stringify({ folders: [{ path: fixture }, { path: second }] }));
}
const result = spawnSync(executable, ['--new-window', '--skip-welcome', '--skip-release-notes', '--disable-workspace-trust',
  `--user-data-dir=${profile}`, `--extensions-dir=${path.join(process.env.USERPROFILE, '.vscode', 'extensions')}`,
  `--extensionDevelopmentPath=${root}`, `--extensionTestsPath=${path.join(root, 'out', 'integration.js')}`, workspace],
  { env: { ...process.env, MLR_INTEGRATION_ROOT: fixture }, encoding: 'utf8', timeout: 90000 });
fs.writeFileSync(path.join(fixture, 'host.log'), (result.stdout || '') + (result.stderr || ''));
const report = path.join(fixture, 'integration-result.json');
if (fs.existsSync(report)) console.log(fs.readFileSync(report, 'utf8'));
console.log(`Integration host exit=${result.status}; ${result.error?.message || ''}`);
process.exitCode = result.status === 0 ? 0 : 1;
