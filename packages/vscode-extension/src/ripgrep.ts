import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function findRipgrepBinary(): string | null {
  const appRoot = vscode.env.appRoot;

  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const platformArch =
    process.platform === 'win32'
      ? `win32-${arch}`
      : process.platform === 'darwin'
        ? `darwin-${arch}`
        : `linux-${arch}`;

  const rgBin = process.platform === 'win32' ? 'rg.exe' : 'rg';

  // All known locations to check in priority order
  const pathsToCheck = [
    // ripgrep-universal (Mac and modern VS Code)
    path.join(
      appRoot,
      'node_modules',
      '@vscode',
      'ripgrep-universal',
      'bin',
      platformArch,
      rgBin
    ),

    // Standard ripgrep (older VS Code / Linux)
    path.join(appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', rgBin),

    // asar.unpacked (production builds)
    path.join(
      appRoot,
      'node_modules.asar.unpacked',
      '@vscode',
      'ripgrep',
      'bin',
      rgBin
    ),

    // asar.unpacked universal
    path.join(
      appRoot,
      'node_modules.asar.unpacked',
      '@vscode',
      'ripgrep-universal',
      'bin',
      platformArch,
      rgBin
    ),

    // Windows specific - Program Files
    'C:\\Program Files\\Microsoft VS Code\\resources\\app\\node_modules\\@vscode\\ripgrep\\bin\\rg.exe',

    // Windows specific - User install
    path.join(
      process.env.LOCALAPPDATA || '',
      'Programs',
      'Microsoft VS Code',
      'resources',
      'app',
      'node_modules',
      '@vscode',
      'ripgrep-universal',
      'bin',
      platformArch,
      rgBin
    ),

    // Windows specific - ripgrep-universal
    path.join(
      process.env.LOCALAPPDATA || '',
      'Programs',
      'Microsoft VS Code',
      'resources',
      'app',
      'node_modules',
      '@vscode',
      'ripgrep',
      'bin',
      rgBin
    ),

    // Common system install locations (GUI-launched VS Code may not
    // have Homebrew/user paths on PATH, so `which rg` can miss these)
    '/opt/homebrew/bin/rg',
    '/usr/local/bin/rg',
    '/usr/bin/rg',
  ];

  for (const p of pathsToCheck) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }

  // Try @vscode/ripgrep npm package
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
    const whichCmd = process.platform === 'win32' ? 'where rg' : 'which rg';
    const result = require('child_process')
      .execSync(whichCmd, { encoding: 'utf8' })
      .trim();
    if (result) {
      return result.split('\n')[0];
    }
  } catch {
    // not on PATH
  }

  return null;
}
