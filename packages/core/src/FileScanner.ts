import { FileCandidate } from './types';

export interface FileScanner {
  getFiles(): Promise<FileCandidate[]>;
  readFile(path: string): Promise<string>;
}
