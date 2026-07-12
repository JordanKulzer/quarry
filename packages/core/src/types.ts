export interface FileCandidate {
  path: string;
  relativePath: string;
}

export interface SearchTerm {
  value: string;
}

export interface TermMatch {
  term: string;
  /** 1-based */
  lineNumber: number;
  /** 1-based, position of match start on that line */
  columnNumber: number;
  /** the full line content, trimmed */
  snippet: string;
}

export interface SearchResult {
  file: FileCandidate;
  /** one per term, only terms that were found */
  matches: TermMatch[];
  /** true only if every search term has at least one match */
  allTermsFound: boolean;
}

export interface SearchOptions {
  terms: string[];
  /** glob patterns to skip */
  excludePatterns?: string[];
  maxResults?: number;
  caseSensitive?: boolean;
}
