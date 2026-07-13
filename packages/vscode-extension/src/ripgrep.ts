import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export function findRipgrepBinary(): string | null {
  const appRoot = vscode.env.appRoot;

  // Determine platform and arch strings
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

  // Check each path
  for (const p of pathsToCheck) {
    console.log('Quarry: checking', p, '=', fs.existsSync(p));
    if (p && fs.existsSync(p)) {
      console.log('Quarry: found ripgrep at', p);
      return p;
    }
  }

  // Try @vscode/ripgrep npm package
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { rgPath } = require('@vscode/ripgrep');
    if (rgPath && fs.existsSync(rgPath)) {
      console.log('Quarry: found ripgrep via npm package at', rgPath);
      return rgPath;
    }
  } catch {
    console.log('Quarry: @vscode/ripgrep package not available');
  }

  // Try system ripgrep
  try {
    const whichCmd = process.platform === 'win32' ? 'where rg' : 'which rg';
    const result = require('child_process')
      .execSync(whichCmd, { encoding: 'utf8' })
      .trim();
    if (result) {
      console.log('Quarry: found system ripgrep at', result);
      return result.split('\n')[0]; // take first result on Windows
    }
  } catch {
    console.log('Quarry: system ripgrep not found');
  }

  console.log('Quarry: ripgrep not found, using fallback scanner');
  console.log(
    'Quarry: tip — install ripgrep: brew install ripgrep (Mac) or choco install ripgrep (Windows)'
  );
  return null;
}
