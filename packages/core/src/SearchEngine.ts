import { FileScanner } from './FileScanner';
import { SearchOptions, SearchResult, TermMatch } from './types';

const MAX_SNIPPET_LENGTH = 200;
const MAX_MATCHES_PER_TERM = 5;

function globToRegExp(pattern: string): RegExp {
  let regex = '';
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        regex += '.*';
        i++;
        if (pattern[i + 1] === '/') i++;
      } else {
        regex += '[^/]*';
      }
    } else if (char === '?') {
      regex += '[^/]';
    } else if ('\\^$.|+()[]{}'.includes(char)) {
      regex += '\\' + char;
    } else {
      regex += char;
    }
  }
  return new RegExp(`(^|/)${regex}$`);
}

function averageLineNumber(matches: TermMatch[]): number {
  if (matches.length === 0) return 0;
  return matches.reduce((sum, m) => sum + m.lineNumber, 0) / matches.length;
}

export class SearchEngine {
  constructor(private scanner: FileScanner) {}

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const excludeRegexes = (options.excludePatterns ?? []).map(globToRegExp);
    const files = await this.scanner.getFiles();
    const results: SearchResult[] = [];

    for (const file of files) {
      if (options.maxResults !== undefined && results.length >= options.maxResults) {
        break;
      }
      if (excludeRegexes.some((re) => re.test(file.relativePath))) {
        continue;
      }

      let content: string;
      try {
        content = await this.scanner.readFile(file.path);
      } catch (error) {
        console.error(`Failed to read ${file.path}:`, error);
        continue;
      }

      if (content.includes('\0')) {
        continue;
      }

      const matches = this.searchContent(content, options);
      if (matches) {
        results.push({ file, matches, allTermsFound: true });
      }
    }

    results.sort((a, b) => averageLineNumber(a.matches) - averageLineNumber(b.matches));
    return results;
  }

  /**
   * Collects up to MAX_MATCHES_PER_TERM matches per term (one per matching
   * line). Returns null unless every term matches at least once.
   */
  private searchContent(content: string, options: SearchOptions): TermMatch[] | null {
    const caseSensitive = options.caseSensitive ?? false;
    const lines = content.split('\n').map((line) =>
      line.endsWith('\r') ? line.slice(0, -1) : line
    );
    const haystacks = caseSensitive ? lines : lines.map((line) => line.toLowerCase());

    const matches: TermMatch[] = [];
    for (const term of options.terms) {
      const needle = caseSensitive ? term : term.toLowerCase();
      let found = 0;
      for (let i = 0; i < lines.length && found < MAX_MATCHES_PER_TERM; i++) {
        const col = haystacks[i].indexOf(needle);
        if (col === -1) continue;
        matches.push({
          term,
          lineNumber: i + 1,
          columnNumber: col + 1,
          snippet: lines[i].trim().slice(0, MAX_SNIPPET_LENGTH),
        });
        found++;
      }
      if (found === 0) {
        return null;
      }
    }
    return matches;
  }
}
