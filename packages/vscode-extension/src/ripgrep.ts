import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function findRipgrepBinary(): string | null {
  // Try VS Code's bundled ripgrep first
  const vscodeRg = path.join(
    vscode.env.appRoot,
    'node_modules',
    '@vscode',
    'ripgrep',
    'bin',
    process.platform === 'win32' ? 'rg.exe' : 'rg'
  );
  if (fs.existsSync(vscodeRg)) {
    return vscodeRg;
  }

  // Try the @vscode/ripgrep package
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { rgPath } = require('@vscode/ripgrep');
    if (rgPath && fs.existsSync(rgPath)) {
      return rgPath;
    }
  } catch {
    // package not installed or binary missing
  }

  // Try system ripgrep
  try {
    const result = require('child_process')
      .execSync(process.platform === 'win32' ? 'where rg' : 'which rg', {
        encoding: 'utf8',
      })
      .trim()
      .split(/\r?\n/)[0];
    if (result) {
      return result;
    }
  } catch {
    // not on PATH
  }

  return null;
}
