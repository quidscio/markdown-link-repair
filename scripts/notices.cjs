const fs = require('node:fs');
const path = require('node:path');
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
let notices = '# Third-party notices\n\nRuntime dependencies are bundled into out/extension.js. Their license texts follow.\n';
for (const [directory, info] of Object.entries(lock.packages)) {
  if (!directory || info.dev) continue;
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const licenses = fs.readdirSync(directory).filter(name => /^licen[cs]e(?:\.|$)/i.test(name));
  notices += `\n## ${manifest.name} ${manifest.version}\n\n`;
  for (const file of licenses) notices += fs.readFileSync(path.join(directory, file), 'utf8') + '\n';
}
fs.writeFileSync('THIRD_PARTY_NOTICES.md', notices.trimEnd() + '\n');
