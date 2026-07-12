import * as vscode from 'vscode';
import { FileCandidate, FileScanner } from '@quarry/core';

const DEFAULT_EXCLUDES = ['node_modules', '.git', 'dist', 'out', '.next', 'build'];

function toGlobParts(pattern: string): string[] {
  const p = pattern.replace(/\/+$/, '');
  if (p.startsWith('**/')) {
    return [p, `${p}/**`];
  }
  // Match the pattern itself (files) and anything beneath it (directories),
  // at any depth in the workspace.
  return [`**/${p}`, `**/${p}/**`];
}

export class VscodeFileScanner implements FileScanner {
  private readonly excludeGlob: string;

  constructor(extraExcludes: string[] = []) {
    const merged = [
      ...DEFAULT_EXCLUDES,
      ...extraExcludes.filter((p) => !DEFAULT_EXCLUDES.includes(p)),
    ];
    this.excludeGlob = `{${merged.flatMap(toGlobParts).join(',')}}`;
  }

  async getFiles(): Promise<FileCandidate[]> {
    if (!vscode.workspace.workspaceFolders?.length) {
      return [];
    }
    const uris = await vscode.workspace.findFiles('**/*', this.excludeGlob);
    return uris.map((uri) => ({
      path: uri.fsPath,
      relativePath: vscode.workspace.asRelativePath(uri),
    }));
  }

  async readFile(path: string): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(path));
    return new TextDecoder('utf-8').decode(bytes);
  }
}
