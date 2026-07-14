import * as path from 'path';
import { SearchResult, TermMatch } from '@quarry/core';
import { RipgrepScanner } from './RipgrepScanner';

export interface RipgrepEngineOptions {
  terms: string[];
  caseSensitive: boolean;
  excludePatterns: string[];
  fileTypes: string[];
  shouldCancel: () => boolean;
}

function averageLineNumber(matches: TermMatch[]): number {
  if (matches.length === 0) return 0;
  return matches.reduce((sum, m) => sum + m.lineNumber, 0) / matches.length;
}

export class RipgrepSearchEngine {
  private scanners: RipgrepScanner[] = [];

  constructor(
    private rgPath: string,
    private workspacePath: string
  ) {}

  cancel(): void {
    this.scanners.forEach((scanner) => scanner.cancel());
  }

  async search(options: RipgrepEngineOptions): Promise<SearchResult[]> {
    this.scanners = options.terms.map(() => new RipgrepScanner());
    const termMaps = await Promise.all(
      options.terms.map((term, i) =>
        this.scanners[i]
          .searchTerm(term, this.workspacePath, {
            caseSensitive: options.caseSensitive,
            excludePatterns: options.excludePatterns,
            fileTypes: options.fileTypes,
            rgPath: this.rgPath,
          })
          // A term whose rg process fails to spawn contributes no files,
          // which empties the intersection rather than crashing the search.
          .catch(() => new Map<string, TermMatch[]>())
      )
    );
    this.scanners = [];

    // Intersect: keep only files that matched every term. A cancelled
    // search intersects the partial maps, so whatever survived is still
    // guaranteed to contain all terms.
    let paths = new Set(termMaps[0]?.keys() ?? []);
    for (let i = 1; i < termMaps.length; i++) {
      paths = new Set([...paths].filter((p) => termMaps[i].has(p)));
    }

    const results: SearchResult[] = [];
    for (const filePath of paths) {
      const matches: TermMatch[] = [];
      for (const termMap of termMaps) {
        matches.push(...(termMap.get(filePath) ?? []));
      }
      matches.sort((a, b) => a.lineNumber - b.lineNumber);
      results.push({
        file: {
          path: filePath,
          relativePath: path
            .relative(this.workspacePath, filePath)
            .split(path.sep)
            .join('/'),
        },
        matches,
        allTermsFound: true,
      });
    }

    results.sort((a, b) => averageLineNumber(a.matches) - averageLineNumber(b.matches));
    return results;
  }
}
