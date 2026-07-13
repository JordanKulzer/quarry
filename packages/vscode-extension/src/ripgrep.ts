import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function findRipgrepBinary(): string | null {
  const binName = process.platform === 'win32' ? 'rg.exe' : 'rg';

  // Attempt 1 - VS Code bundled ripgrep
  const appRoot = vscode.env.appRoot;
  console.log('Quarry: appRoot =', appRoot);

  const vscodeRg = path.join(
    appRoot,
    'node_modules',
    '@vscode',
    'ripgrep',
    'bin',
    binName
  );
  console.log('Quarry: checking path 1 =', vscodeRg);
  console.log('Quarry: path 1 exists =', fs.existsSync(vscodeRg));
  if (fs.existsSync(vscodeRg)) {
    return vscodeRg;
  }

  // Also try alternative VS Code paths
  const altPaths = [
    path.join(
      appRoot,
      'node_modules.asar.unpacked',
      '@vscode',
      'ripgrep',
      'bin',
      binName
    ),
    path.join(appRoot, '..', 'bin', binName),
  ];
  for (let i = 0; i < altPaths.length; i++) {
    const p = altPaths[i];
    const exists = fs.existsSync(p);
    console.log(`Quarry: checking alt path ${i} =`, p);
    console.log(`Quarry: alt path ${i} exists =`, exists);
    if (exists) {
      return p;
    }
  }

  // Attempt 2 - @vscode/ripgrep package
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { rgPath } = require('@vscode/ripgrep');
    console.log('Quarry: @vscode/ripgrep path =', rgPath);
    console.log('Quarry: @vscode/ripgrep exists =', fs.existsSync(rgPath));
    if (rgPath && fs.existsSync(rgPath)) {
      return rgPath;
    }
  } catch (e) {
    console.log('Quarry: @vscode/ripgrep require failed =', (e as Error).message);
  }

  // Attempt 3 - system rg
  try {
    const result = require('child_process')
      .execSync(process.platform === 'win32' ? 'where rg' : 'which rg', {
        encoding: 'utf8',
      })
      .trim()
      .split(/\r?\n/)[0];
    console.log('Quarry: system rg =', result);
    if (result) {
      return result;
    }
  } catch (e) {
    console.log('Quarry: system rg not found =', (e as Error).message);
  }

  return null;
}
