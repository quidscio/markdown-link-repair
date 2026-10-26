const esbuild = require('esbuild');
esbuild.buildSync({ entryPoints: ['src/extension.ts', 'src/gate.ts', 'src/prototype.ts', 'src/manual.ts', 'src/integration.ts', 'src/extract.ts', 'src/normalize.ts', 'src/host.ts'],
  bundle: true, platform: 'node', target: 'node22', format: 'cjs', outdir: 'out', external: ['vscode'], sourcemap: true });
