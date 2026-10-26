// Uses the actual installed VS Code and its default user profile; never disables
// installed extensions or changes settings. Each test host closes after its run.
const { spawnSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const executable = process.env.VSCODE_EXE || path.join(process.env.LOCALAPPDATA,
  'Programs', 'Microsoft VS Code', 'Code.exe');
const live = process.argv.includes('--live');
const manual = process.argv.includes('--manual');
const development = path.join(root, '.gate-runtime', 'probe-extension');
fs.mkdirSync(development, { recursive: true });
for (const file of ['prototype.js', 'gate.js']) fs.copyFileSync(path.join(root, 'out', file), path.join(development, file));
fs.writeFileSync(path.join(development, 'package.json'), JSON.stringify({ name: 'markdown-link-repair-probe', publisher: 'local',
  version: '0.0.1', engines: { vscode: '^1.143.0' }, main: './prototype.js', activationEvents: ['*'] }));
for (const order of ['early', 'late']) {
  const fixtureRoot = path.join(root, '.gate-runtime', (live ? 'live-' : manual ? 'manual-' : '') + order);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, 'target.html'), '<!doctype html><title>Link repair gate</title><p>Target</p>\n');
  fs.writeFileSync(path.join(fixtureRoot, 'fixture.md'), `[Report](${path.join(fixtureRoot, 'target.html')})\r\n`);
  const profileRoot = path.join(root, '.gate-runtime', 'gate-profile-' + order);
  if (!live) {
    fs.mkdirSync(path.join(profileRoot, 'User', 'globalStorage'), { recursive: true });
    const user = path.join(process.env.APPDATA, 'Code', 'User');
    for (const file of ['settings.json', 'keybindings.json']) {
      const source = path.join(user, file);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(profileRoot, 'User', file));
    }
  }
  if (live || manual) fs.writeFileSync(path.join(fixtureRoot, 'run-live-gate'), 'Development gate only\n');
  else if (fs.existsSync(path.join(fixtureRoot, 'run-live-gate'))) fs.unlinkSync(path.join(fixtureRoot, 'run-live-gate'));
  const args = ['--new-window', '--skip-welcome', '--skip-release-notes',
    `--extensions-dir=${path.join(process.env.USERPROFILE, '.vscode', 'extensions')}`,
    `--extensionDevelopmentPath=${development}`, ...(live ? [] : ['--disable-workspace-trust',
      `--user-data-dir=${profileRoot}`, ...(manual ? [] : [`--extensionTestsPath=${path.join(root, 'out', 'gate.js')}`])]),
    fixtureRoot];
  if (live || manual) {
    spawn(executable, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    console.log(`Opened ${order} fixture window (${live ? 'live' : 'temporary'} profile).`);
    continue;
  }
  const result = spawnSync(executable, args, { env: { ...process.env, MLR_GATE_ROOT: fixtureRoot, MLR_GATE_ORDER: order },
    encoding: 'utf8', timeout: 90000 });
  console.log(`${order}: exit=${result.status}, error=${result.error?.message || 'none'}`);
  fs.writeFileSync(path.join(fixtureRoot, 'host.log'), (result.stdout || '') + (result.stderr || ''));
  if (live || manual) continue;
  const report = path.join(fixtureRoot, 'result.json');
  if (fs.existsSync(report)) console.log(fs.readFileSync(report, 'utf8'));
  else { process.exitCode = 1; break; }
  if (result.status !== 0) { process.exitCode = 1; break; }
}
