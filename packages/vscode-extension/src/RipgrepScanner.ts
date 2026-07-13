import { ChildProcess, spawn } from 'child_process';
import { TermMatch } from '@quarry/core';

const DEFAULT_EXCLUDES = ['node_modules', '.git', 'dist', 'out', '.next', 'build'];
const MAX_SNIPPET_LENGTH = 200;

export interface RipgrepSearchOptions {
  caseSensitive: boolean;
  excludePatterns: string[];
  rgPath: string;
}

/**
 * Runs one ripgrep process for a single term and collects its matches
 * grouped by file path.
 */
export class RipgrepScanner {
  private proc: ChildProcess | null = null;

  cancel(): void {
    this.proc?.kill();
  }

  async searchTerm(
    term: string,
    workspacePath: string,
    options: RipgrepSearchOptions
  ): Promise<Map<string, TermMatch[]>> {
    const args = [
      '--json',
      '--line-number',
      '--no-heading',
      '--max-count', '5',
      // Terms are plain substrings, matching the original engine's semantics
      // (and keeping regex metacharacters in terms from breaking rg).
      '--fixed-strings',
    ];
    if (!options.caseSensitive) {
      args.push('--ignore-case');
    }
    const allExcludes = [...DEFAULT_EXCLUDES, ...options.excludePatterns];
    allExcludes.forEach((p) => args.push('--glob', `!${p}`));
    args.push('--', term, workspacePath);

    return new Promise((resolve, reject) => {
      const rg = spawn(options.rgPath, args);
      this.proc = rg;
      const matchesByFile = new Map<string, TermMatch[]>();
      let buffer = '';

      rg.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (!line.trim()) {
            continue;
          }
          try {
            const msg = JSON.parse(line);
            if (msg.type !== 'match') {
              continue;
            }
            const filePath: string = msg.data.path.text;
            const matches = matchesByFile.get(filePath) ?? [];
            matches.push({
              term,
              lineNumber: msg.data.line_number,
              columnNumber: 1,
              snippet: String(msg.data.lines.text ?? '')
                .trim()
                .slice(0, MAX_SNIPPET_LENGTH),
            });
            matchesByFile.set(filePath, matches);
          } catch {
            // skip unparseable lines
          }
        }
      });

      rg.on('error', reject);
      // 'close' also fires after kill(), resolving with whatever was
      // collected so far — this is what makes cancellation return
      // partial results.
      rg.on('close', () => {
        this.proc = null;
        resolve(matchesByFile);
      });
    });
  }
}
