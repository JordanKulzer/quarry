import * as vscode from 'vscode';
import { SearchEngine, SearchResult } from '@quarry/core';
import { VscodeFileScanner } from './VscodeFileScanner';
import { RipgrepSearchEngine } from './RipgrepSearchEngine';
import { findRipgrepBinary } from './ripgrep';

const RESULTS_PAGE_SIZE = 50;

export class QuarryPanel implements vscode.WebviewViewProvider {
  static readonly viewType = 'quarry.searchPanel';

  private resultsCache: SearchResult[] = [];
  private currentResults: SearchResult[] = [];
  private resultsSent = 0;
  readonly historyKey = 'quarry.searchHistory';
  readonly excludeKey = 'quarry.excludePatterns';
  readonly fileTypesKey = 'quarry.fileTypes';
  caseSensitive = false;
  private isCancelled = false;
  private activeRipgrepEngines: RipgrepSearchEngine[] = [];
  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {}

  postMessage(message: unknown): void {
    this.view?.webview.postMessage(message);
  }

  /** Stored as a raw comma-separated string; older versions stored an array. */
  private getSavedExcludePatterns(): string {
    const saved = this.context.globalState.get<string | string[]>(this.excludeKey, '');
    return Array.isArray(saved) ? saved.join(', ') : saved;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'ready': {
          webviewView.webview.postMessage({
            command: 'setExcludePatterns',
            value: this.getSavedExcludePatterns(),
          });
          webviewView.webview.postMessage({
            command: 'setFileTypes',
            value: this.context.globalState.get<string>(this.fileTypesKey, ''),
          });
          const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
          if (workspaceFolders.length > 1) {
            webviewView.webview.postMessage({
              command: 'setWorkspaceFolders',
              folders: workspaceFolders.map((f) => ({
                name: f.name,
                path: f.uri.fsPath,
              })),
            });
          }
          break;
        }
        case 'search': {
          const excludeValue = Array.isArray(message.excludePatterns)
            ? message.excludePatterns.join(', ')
            : typeof message.excludePatterns === 'string'
              ? message.excludePatterns
              : '';
          await this.context.globalState.update(this.excludeKey, excludeValue);
          const excludePatterns = excludeValue
            .split(',')
            .map((p: string) => p.trim())
            .filter(Boolean);
          const fileTypesValue =
            typeof message.fileTypes === 'string' ? message.fileTypes : '';
          await this.context.globalState.update(this.fileTypesKey, fileTypesValue);
          const fileTypes = fileTypesValue
            .split(',')
            .map((t: string) => t.trim())
            .filter(Boolean);
          const selectedFolder =
            typeof message.workspaceFolder === 'string' && message.workspaceFolder
              ? message.workspaceFolder
              : null;
          this.isCancelled = false;
          const allRoots = (vscode.workspace.workspaceFolders ?? []).map(
            (f) => f.uri.fsPath
          );
          const searchRoots = selectedFolder ? [selectedFolder] : allRoots;
          const rgPath = findRipgrepBinary();
          if (rgPath && searchRoots.length > 0) {
            console.log('Quarry: using ripgrep at', rgPath);
            this.activeRipgrepEngines = searchRoots.map(
              (root) => new RipgrepSearchEngine(rgPath, root)
            );
            try {
              const perRoot = await Promise.all(
                this.activeRipgrepEngines.map((engine) =>
                  engine.search({
                    terms: message.terms,
                    caseSensitive: !!message.caseSensitive,
                    excludePatterns,
                    fileTypes,
                    shouldCancel: () => this.isCancelled,
                  })
                )
              );
              this.resultsCache = perRoot.flat();
              if (searchRoots.length > 1) {
                const avgLine = (r: SearchResult) =>
                  r.matches.reduce((s, m) => s + m.lineNumber, 0) /
                  (r.matches.length || 1);
                this.resultsCache.sort((a, b) => avgLine(a) - avgLine(b));
              }
            } finally {
              this.activeRipgrepEngines = [];
            }
          } else {
            console.log('Quarry: using fallback scanner');
            const scanner = new VscodeFileScanner(excludePatterns, fileTypes);
            let files = await scanner.getFiles();
            if (selectedFolder) {
              files = files.filter((f) => f.path.startsWith(selectedFolder));
            }
            webviewView.webview.postMessage({
              command: 'scanCount',
              count: files.length,
            });
            const engine = new SearchEngine(scanner);
            this.resultsCache = await engine.searchFiles(
              files,
              {
                terms: message.terms,
                caseSensitive: !!message.caseSensitive,
              },
              () => this.isCancelled
            );
          }
          this.currentResults = this.resultsCache;
          if (this.isCancelled) {
            this.resultsSent = this.resultsCache.length;
            webviewView.webview.postMessage({
              command: 'results',
              results: this.resultsCache,
              total: this.resultsCache.length,
              hasMore: false,
              cancelled: true,
            });
            break;
          }
          if (this.resultsCache.length > 0) {
            const terms: string[] = message.terms;
            const history = this.context.globalState.get<string[][]>(this.historyKey, []);
            const deduped = [
              terms,
              ...history.filter((h) => h.join(',') !== terms.join(',')),
            ].slice(0, 25);
            await this.context.globalState.update(this.historyKey, deduped);
          }
          if (this.resultsCache.length > 150) {
            const capped = this.resultsCache.slice(0, 150);
            this.resultsSent = capped.length;
            webviewView.webview.postMessage({
              command: 'results',
              results: capped,
              total: this.resultsCache.length,
              hasMore: false,
              capped: true,
            });
            break;
          }
          const page = this.resultsCache.slice(0, RESULTS_PAGE_SIZE);
          this.resultsSent = page.length;
          webviewView.webview.postMessage({
            command: 'results',
            results: page,
            total: this.resultsCache.length,
            hasMore: this.resultsSent < this.resultsCache.length,
          });
          break;
        }
        case 'saveExcludePatterns': {
          await this.context.globalState.update(
            this.excludeKey,
            typeof message.value === 'string' ? message.value : ''
          );
          break;
        }
        case 'stopSearch': {
          this.isCancelled = true;
          this.activeRipgrepEngines.forEach((engine) => engine.cancel());
          break;
        }
        case 'loadMore': {
          const page = this.resultsCache.slice(
            this.resultsSent,
            this.resultsSent + RESULTS_PAGE_SIZE
          );
          this.resultsSent += page.length;
          webviewView.webview.postMessage({
            command: 'results',
            results: page,
            total: this.resultsCache.length,
            hasMore: this.resultsSent < this.resultsCache.length,
            append: true,
          });
          break;
        }
        case 'openFile': {
          const document = await vscode.workspace.openTextDocument(
            vscode.Uri.file(message.path)
          );
          const editor = await vscode.window.showTextDocument(document);
          const line = Math.max(0, (message.line ?? 1) - 1);
          const range = document.lineAt(line).range;
          editor.selection = new vscode.Selection(range.start, range.start);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          if (typeof message.term === 'string' && message.term) {
            const highlightDecoration = vscode.window.createTextEditorDecorationType({
              backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
              borderRadius: '3px',
            });
            const lineText = document.lineAt(line).text;
            const col = lineText.toLowerCase().indexOf(message.term.toLowerCase());
            if (col >= 0) {
              const highlightRange = new vscode.Range(
                line,
                col,
                line,
                col + message.term.length
              );
              editor.setDecorations(highlightDecoration, [highlightRange]);
              setTimeout(() => highlightDecoration.dispose(), 3000);
            } else {
              highlightDecoration.dispose();
            }
          }
          break;
        }
        case 'copyFilePaths': {
          const pathsString = this.currentResults
            .map((result) => result.file.path)
            .join('\n');
          await vscode.env.clipboard.writeText(pathsString);
          vscode.window.showInformationMessage(
            `${this.currentResults.length} file paths copied to clipboard`
          );
          break;
        }
        case 'getHistory': {
          webviewView.webview.postMessage({
            command: 'history',
            items: this.context.globalState.get<string[][]>(this.historyKey, []),
          });
          break;
        }
        case 'clearHistory': {
          await this.context.globalState.update(this.historyKey, []);
          webviewView.webview.postMessage({ command: 'history', items: [] });
          break;
        }
        case 'deleteHistoryItem': {
          const history = this.context.globalState.get<string[][]>(this.historyKey, []);
          const updated = history.filter((_, i) => i !== message.index);
          await this.context.globalState.update(this.historyKey, updated);
          webviewView.webview.postMessage({ command: 'history', items: updated });
          break;
        }
      }
    });
  }

  private getHtml(): string {
    const csp =
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';";
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    html, body {
      height: 100%;
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground);
      background-color: var(--vscode-sideBar-background);
      padding: 12px;
      margin: 0;
      box-sizing: border-box;
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    #term-input {
      width: 100%;
      box-sizing: border-box;
      padding: 4px 6px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      outline: none;
      transition: border-color 0.1s;
      font-family: inherit;
      font-size: inherit;
    }
    #chips {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
    }
    #chips:empty {
      display: none;
    }
    #chips-clear {
      margin-left: auto;
      border: none;
      background: none;
      padding: 0;
      font-family: inherit;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
      text-decoration: none;
      opacity: 0.8;
    }
    #chips-clear:hover {
      text-decoration: underline;
      opacity: 1;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 0.9em;
      max-width: 100%;
    }
    .chip-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chip-remove {
      border: none;
      background: none;
      color: inherit;
      cursor: pointer;
      padding: 0;
      font-size: 1em;
      line-height: 1;
    }
    #search-button {
      width: 100%;
      padding: 6px;
      border: none;
      border-radius: 2px;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
    }
    #search-button:hover:not(:disabled) {
      background-color: var(--vscode-button-hoverBackground);
    }
    #search-button:disabled {
      opacity: 0.6;
      cursor: default;
    }
    #status-row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 1em;
    }
    #status {
      font-size: 0.9em;
      opacity: 0.8;
    }
    @keyframes dig {
      from { transform: rotate(-20deg); }
      to { transform: rotate(20deg); }
    }
    #pickaxe {
      display: none;
      font-size: 18px;
      line-height: 1;
      transform-origin: bottom center;
      animation: dig 0.4s ease-in-out infinite alternate;
    }
    #pickaxe.active {
      display: inline-block;
    }
    #show-more {
      width: 100%;
      flex: none;
      padding: 5px;
      border: 1px solid var(--vscode-input-border, rgba(128, 128, 128, 0.35));
      border-radius: 2px;
      background: none;
      color: var(--vscode-foreground);
      cursor: pointer;
      font-family: inherit;
      font-size: 0.9em;
    }
    #show-more:hover:not(:disabled) {
      background-color: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.15));
    }
    #show-more:disabled {
      opacity: 0.6;
      cursor: default;
    }
    #results {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .result-card {
      border: 1px solid var(--vscode-input-border, rgba(128, 128, 128, 0.35));
      border-radius: 3px;
      flex: none;
      min-height: unset;
      overflow: hidden;
    }
    .result-header {
      display: flex;
      align-items: center;
      min-height: 28px;
      overflow: visible;
      gap: 6px;
      padding: 0 8px;
      box-sizing: border-box;
      cursor: pointer;
      background-color: var(--vscode-sideBarSectionHeader-background, transparent);
    }
    .result-header:hover {
      background-color: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.15));
    }
    .result-toggle {
      border: none;
      background: none;
      color: inherit;
      cursor: pointer;
      padding: 0;
      width: 14px;
      flex: none;
      margin-left: auto;
    }
    .result-title {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      padding: 4px 0;
    }
    .result-filename {
      font-size: 13px;
      font-weight: 500;
      color: var(--vscode-foreground);
    }
    .result-dir {
      display: block;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .match-badge {
      font-size: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 10px;
      padding: 1px 6px;
      margin-left: 6px;
      white-space: nowrap;
    }
    .result-body {
      padding: 0 8px 8px 8px;
      max-height: 350px;
      overflow-y: auto;
      transition: max-height 0.2s ease, padding 0.2s ease;
    }
    .result-card.collapsed .result-body {
      max-height: 0;
      overflow: hidden;
      padding-top: 0;
      padding-bottom: 0;
    }
    #results-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex: none;
    }
    #copy-paths {
      border: none;
      background: none;
      padding: 0;
      cursor: pointer;
      font-family: inherit;
      font-size: 11px;
      color: var(--vscode-descriptionForeground, inherit);
      opacity: 0.9;
      flex: none;
    }
    #copy-paths:hover {
      text-decoration: underline;
      opacity: 1;
    }
    #collapse-all {
      align-self: flex-end;
      border: none;
      background: none;
      padding: 0;
      cursor: pointer;
      font-family: inherit;
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground, inherit);
      opacity: 0.9;
      flex: none;
    }
    #collapse-all:hover {
      text-decoration: underline;
      opacity: 1;
    }
    .match-line {
      display: block;
      color: var(--vscode-foreground);
      margin-top: 2px;
      padding: 3px 6px;
      border-radius: 2px;
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
    }
    .match-line:hover {
      background-color: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.15));
    }
    .match-snippet {
      font-family: var(--vscode-editor-font-family, monospace);
      color: var(--vscode-descriptionForeground);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <select id="workspace-select" style="
    width: 100%;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 3px;
    padding: 4px 8px;
    font-size: 12px;
    box-sizing: border-box;
    margin-bottom: 6px;
    display: none;
  "></select>
  <input id="term-input" type="text" placeholder="Type a term and press Enter…">
  <div id="chips"></div>
  <div id="options-toggle" style="
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 6px;
    user-select: none;
    padding: 2px 0;
  ">
    <span>Options</span>
    <span id="options-chevron">&#9656;</span>
  </div>
  <div id="options-body" style="display: none;">
    <input id="exclude-input" type="text"
      placeholder="Add folder to exclude..."
      style="
        width: 100%;
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 3px;
        padding: 4px 8px;
        font-size: 12px;
        box-sizing: border-box;
        margin-bottom: 4px;
        outline: none;
        transition: border-color 0.1s;
      "
    />
    <div id="exclude-chips" style="
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
      min-height: 0;
    "></div>
    <div style="margin-bottom: 8px;">
      <input id="filetype-input" type="text"
        placeholder="ts, tsx, js, py (empty = all types)"
        style="
          width: 100%;
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
          border-radius: 3px;
          padding: 4px 8px;
          font-size: 12px;
          box-sizing: border-box;
          outline: none;
          transition: border-color 0.1s;
        "
      />
    </div>
  </div>
  <button id="search-button">Search</button>
  <button id="stop-btn" style="
    width: 100%;
    padding: 5px;
    background: transparent;
    color: var(--vscode-errorForeground);
    border: 1px solid var(--vscode-errorForeground);
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
    display: none;
    margin-top: 4px;
  ">Stop search</button>
  <div id="status-row">
    <span id="pickaxe">&#x26CF;&#xFE0F;</span>
    <span id="status"></span>
  </div>
  <div id="search-tip" style="
    display: none;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    text-align: center;
    padding: 0 16px;
    line-height: 1.5;
  ">
    Taking a while? Add folders to the Exclude field above
    to skip large directories and speed things up.
  </div>
  <div id="empty-state" style="
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 12px;
    opacity: 0.4;
    padding: 40px 20px;
    text-align: center;
  ">
    <div style="font-size: 48px">&#x26CF;</div>
    <div style="font-size: 13px; font-weight: 500;">Quarry</div>
    <div style="font-size: 11px; line-height: 1.5;">
      Add search terms above and press Search to find files
      containing all of them.
    </div>
  </div>
  <div id="no-results-state" style="
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    text-align: center;
    gap: 8px;
    opacity: 0.7;
  ">
    <div style="font-size: 32px;">&#x26CF;</div>
    <div style="
      font-size: 13px;
      font-weight: 500;
      color: var(--vscode-foreground);
    ">No files found</div>
    <div style="
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    ">Try fewer terms, check your spelling, or
    adjust your exclude patterns.</div>
  </div>
  <div id="results"></div>
  <script>
    (function () {
      var TERM_COLORS = [
        { bg: 'rgba(94, 234, 212, 0.25)', border: 'rgba(94, 234, 212, 0.6)', text: '#5eead4' },
        { bg: 'rgba(253, 186, 116, 0.25)', border: 'rgba(253, 186, 116, 0.6)', text: '#fdba74' },
        { bg: 'rgba(216, 180, 254, 0.25)', border: 'rgba(216, 180, 254, 0.6)', text: '#d8b4fe' },
        { bg: 'rgba(252, 211, 77, 0.25)', border: 'rgba(252, 211, 77, 0.6)', text: '#fcd34d' },
        { bg: 'rgba(249, 168, 212, 0.25)', border: 'rgba(249, 168, 212, 0.6)', text: '#f9a8d4' },
        { bg: 'rgba(147, 197, 253, 0.25)', border: 'rgba(147, 197, 253, 0.6)', text: '#93c5fd' },
      ];
      function termColor(index) {
        return TERM_COLORS[index % TERM_COLORS.length];
      }

      var vscode = acquireVsCodeApi();
      var input = document.getElementById('term-input');
      var excludeInput = document.getElementById('exclude-input');
      var excludeChipsEl = document.getElementById('exclude-chips');
      var fileTypeInput = document.getElementById('filetype-input');
      var workspaceSelect = document.getElementById('workspace-select');
      var noResultsEl = document.getElementById('no-results-state');
      var optionsToggle = document.getElementById('options-toggle');
      var optionsBody = document.getElementById('options-body');
      var optionsChevron = document.getElementById('options-chevron');

      function wireFocusBorder(el) {
        el.addEventListener('focus', function () {
          el.style.borderColor = 'var(--vscode-focusBorder)';
        });
        el.addEventListener('blur', function () {
          el.style.borderColor = 'var(--vscode-input-border)';
        });
      }
      wireFocusBorder(input);
      wireFocusBorder(excludeInput);
      wireFocusBorder(fileTypeInput);

      // Always start collapsed; the setExcludePatterns / setFileTypes
      // restore messages auto-expand when saved values exist.
      var optionsOpen = false;

      function setOptionsOpen(open) {
        optionsOpen = open;
        optionsBody.style.display = open ? 'block' : 'none';
        optionsChevron.textContent = open ? '\\u25be' : '\\u25b8';
        var state = vscode.getState() || {};
        state.optionsOpen = open;
        vscode.setState(state);
      }

      optionsToggle.addEventListener('click', function () {
        setOptionsOpen(!optionsOpen);
      });
      var searchTipEl = document.getElementById('search-tip');
      var chipsEl = document.getElementById('chips');
      var searchButton = document.getElementById('search-button');
      var stopBtn = document.getElementById('stop-btn');
      var statusEl = document.getElementById('status');
      var pickaxeEl = document.getElementById('pickaxe');
      var resultsEl = document.getElementById('results');
      var emptyStateEl = document.getElementById('empty-state');

      var terms = [];
      var excludeTerms = [];
      var results = null;
      var total = 0;
      var hasMore = false;
      var searching = false;
      var loadingMore = false;
      var capped = false;
      var caseSensitive = false;
      var slowSearchTimer = null;

      function hideSearchTip() {
        clearTimeout(slowSearchTimer);
        if (searchTipEl) searchTipEl.style.display = 'none';
      }

      function updateEmptyState() {
        emptyStateEl.style.display = !results && !searching ? 'flex' : 'none';
      }

      function addTerm(raw) {
        var value = raw.trim();
        if (value && terms.indexOf(value) === -1) {
          terms.push(value);
          renderChips();
        }
      }

      function removeTerm(index) {
        terms.splice(index, 1);
        renderChips();
      }

      function renderChips() {
        chipsEl.textContent = '';
        terms.forEach(function (term, index) {
          var color = termColor(index);
          var chip = document.createElement('span');
          chip.className = 'chip';
          chip.style.backgroundColor = color.bg;
          chip.style.border = '1px solid ' + color.border;
          chip.style.color = color.text;
          var text = document.createElement('span');
          text.className = 'chip-text';
          text.textContent = term;
          var remove = document.createElement('button');
          remove.className = 'chip-remove';
          remove.textContent = '\\u00d7';
          remove.title = 'Remove term';
          remove.addEventListener('click', function () { removeTerm(index); });
          chip.appendChild(text);
          chip.appendChild(remove);
          chipsEl.appendChild(chip);
        });

        if (terms.length > 0) {
          var clear = document.createElement('button');
          clear.id = 'chips-clear';
          clear.textContent = 'Clear all';
          clear.title = 'Remove all terms';
          clear.addEventListener('click', function () {
            terms = [];
            clearResults();
            renderChips();
            input.focus();
          });
          chipsEl.appendChild(clear);
        }
      }

      function saveExcludes() {
        vscode.postMessage({
          command: 'saveExcludePatterns',
          value: excludeTerms.join(', '),
        });
      }

      function addExcludeTerm(raw) {
        var value = raw.trim();
        if (value && excludeTerms.indexOf(value) === -1) {
          excludeTerms.push(value);
          renderExcludeChips();
          saveExcludes();
        }
      }

      function renderExcludeChips() {
        excludeChipsEl.textContent = '';
        excludeTerms.forEach(function (term, index) {
          var chip = document.createElement('span');
          chip.style.background = 'rgba(239, 68, 68, 0.15)';
          chip.style.border = '1px solid rgba(239, 68, 68, 0.5)';
          chip.style.color = '#fca5a5';
          chip.style.borderRadius = '12px';
          chip.style.padding = '2px 8px';
          chip.style.fontSize = '11px';
          chip.style.display = 'flex';
          chip.style.alignItems = 'center';
          chip.style.gap = '4px';
          var text = document.createElement('span');
          text.style.overflow = 'hidden';
          text.style.textOverflow = 'ellipsis';
          text.style.whiteSpace = 'nowrap';
          text.textContent = term;
          var remove = document.createElement('button');
          remove.textContent = '\\u00d7';
          remove.title = 'Remove exclude';
          remove.style.border = 'none';
          remove.style.background = 'none';
          remove.style.color = '#fca5a5';
          remove.style.cursor = 'pointer';
          remove.style.padding = '0';
          remove.style.fontSize = '1em';
          remove.style.lineHeight = '1';
          remove.addEventListener('click', function () {
            excludeTerms.splice(index, 1);
            renderExcludeChips();
            saveExcludes();
          });
          chip.appendChild(text);
          chip.appendChild(remove);
          excludeChipsEl.appendChild(chip);
        });
      }

      excludeInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          addExcludeTerm(excludeInput.value);
          excludeInput.value = '';
        } else if (event.key === 'Escape') {
          excludeInput.value = '';
        }
      });

      function clearResults() {
        results = null;
        total = 0;
        hasMore = false;
        capped = false;
        collapseAllBtn = null;
        resultsEl.textContent = '';
        noResultsEl.style.display = 'none';
        statusEl.textContent = 'Add terms above, then search.';
        updateEmptyState();
      }


      function appendHighlighted(container, text, term, color) {
        var needle = term.toLowerCase();
        if (!needle) {
          container.textContent = text;
          return;
        }
        var lower = text.toLowerCase();
        var pos = 0;
        var found = lower.indexOf(needle, pos);
        while (found !== -1) {
          if (found > pos) {
            container.appendChild(document.createTextNode(text.slice(pos, found)));
          }
          var mark = document.createElement('span');
          mark.style.color = color.text;
          mark.style.fontWeight = '500';
          mark.textContent = text.slice(found, found + needle.length);
          container.appendChild(mark);
          pos = found + needle.length;
          found = lower.indexOf(needle, pos);
        }
        if (pos < text.length) {
          container.appendChild(document.createTextNode(text.slice(pos)));
        }
      }

      function setCardCollapsed(card, collapsed) {
        card.classList.toggle('collapsed', collapsed);
        var toggle = card.querySelector('.result-toggle');
        toggle.textContent = collapsed ? '\\u25b8' : '\\u25be';
        toggle.title = collapsed ? 'Expand' : 'Collapse';
      }

      var collapseAllBtn = null;

      function countCollapsedCards() {
        var cards = resultsEl.querySelectorAll('.result-card');
        var collapsed = 0;
        cards.forEach(function (card) {
          if (card.classList.contains('collapsed')) collapsed++;
        });
        return { collapsed: collapsed, totalCards: cards.length };
      }

      function updateCollapseAllLabel() {
        if (!collapseAllBtn) return;
        var counts = countCollapsedCards();
        collapseAllBtn.textContent =
          counts.collapsed > counts.totalCards / 2 ? 'Expand all' : 'Collapse all';
      }

      function renderResults() {
        resultsEl.textContent = '';
        if (!results) {
          return;
        }
        noResultsEl.style.display = results.length === 0 ? 'flex' : 'none';
        if (results.length === 0) {
          statusEl.textContent = '';
          return;
        }
        var termColorMap = {};
        terms.forEach(function (term, i) {
          termColorMap[term.toLowerCase()] = termColor(i);
        });
        function colorForTerm(term) {
          return termColorMap[String(term).toLowerCase()] || termColor(0);
        }

        var collapseByDefault = total > 10;
        statusEl.textContent =
          total +
          (total === 1 ? ' file found' : ' files found') +
          (collapseByDefault ? ' \\u2014 click a file to expand' : '');

        if (capped) {
          var cappedNote = document.createElement('div');
          cappedNote.style.color = 'var(--vscode-descriptionForeground)';
          cappedNote.style.fontSize = '11px';
          cappedNote.style.flex = 'none';
          cappedNote.textContent =
            'Showing ' + results.length + ' of ' + total +
            ' files \\u2014 add more terms to narrow results';
          resultsEl.appendChild(cappedNote);
        }

        collapseAllBtn = null;
        if (results.length > 0) {
          var controlsRow = document.createElement('div');
          controlsRow.id = 'results-controls';

          var copyBtn = document.createElement('button');
          copyBtn.id = 'copy-paths';
          copyBtn.textContent = '\\u2398 Copy paths';
          copyBtn.title = 'Copy all file paths to clipboard';
          copyBtn.addEventListener('click', function () {
            vscode.postMessage({ command: 'copyFilePaths' });
          });
          controlsRow.appendChild(copyBtn);

          collapseAllBtn = document.createElement('button');
          collapseAllBtn.id = 'collapse-all';
          collapseAllBtn.addEventListener('click', function () {
            var counts = countCollapsedCards();
            var collapseTo = counts.collapsed <= counts.totalCards / 2;
            resultsEl.querySelectorAll('.result-card').forEach(function (card) {
              setCardCollapsed(card, collapseTo);
            });
            updateCollapseAllLabel();
          });
          controlsRow.appendChild(collapseAllBtn);
          resultsEl.appendChild(controlsRow);
        }

        results.forEach(function (result) {
          var card = document.createElement('div');
          card.className = 'result-card';

          var header = document.createElement('div');
          header.className = 'result-header';

          var toggle = document.createElement('button');
          toggle.className = 'result-toggle';
          toggle.textContent = '\\u25be';
          toggle.title = 'Collapse';
          toggle.addEventListener('click', function (event) {
            event.stopPropagation();
            setCardCollapsed(card, !card.classList.contains('collapsed'));
            updateCollapseAllLabel();
          });

          var parts = result.file.relativePath.split('/');
          var filename = parts.pop();
          var dir = parts.join('/');

          var title = document.createElement('div');
          title.className = 'result-title';
          title.title = result.file.relativePath;

          var filenameEl = document.createElement('span');
          filenameEl.className = 'result-filename';
          filenameEl.textContent = filename;
          title.appendChild(filenameEl);

          var badge = document.createElement('span');
          badge.className = 'match-badge';
          badge.textContent =
            result.matches.length + (result.matches.length === 1 ? ' match' : ' matches');
          title.appendChild(badge);

          if (dir) {
            var dirEl = document.createElement('span');
            dirEl.className = 'result-dir';
            dirEl.textContent = dir;
            title.appendChild(dirEl);
          }

          header.appendChild(title);
          header.appendChild(toggle);
          header.addEventListener('click', function () {
            var first = result.matches.length ? result.matches[0] : null;
            vscode.postMessage({
              command: 'openFile',
              path: result.file.path,
              line: first ? first.lineNumber : 1,
              term: first ? first.term : undefined,
            });
          });

          var body = document.createElement('div');
          body.className = 'result-body';
          result.matches.forEach(function (match) {
            var color = colorForTerm(match.term);
            var line = document.createElement('div');
            line.className = 'match-line';
            line.style.borderLeft = '3px solid ' + color.text;
            line.title = 'Open at line ' + match.lineNumber;
            var lineLabel = document.createElement('span');
            lineLabel.textContent = 'line ' + match.lineNumber + ': ';
            lineLabel.style.color = 'var(--vscode-descriptionForeground)';
            var snippet = document.createElement('span');
            snippet.className = 'match-snippet';
            appendHighlighted(snippet, match.snippet, match.term, color);
            line.appendChild(lineLabel);
            line.appendChild(snippet);
            line.addEventListener('click', function () {
              vscode.postMessage({
                command: 'openFile',
                path: result.file.path,
                line: match.lineNumber,
                term: match.term,
              });
            });
            body.appendChild(line);
          });

          card.appendChild(header);
          card.appendChild(body);
          if (collapseByDefault) {
            setCardCollapsed(card, true);
          }
          resultsEl.appendChild(card);
        });

        if (hasMore) {
          var remaining = total - results.length;
          var showMore = document.createElement('button');
          showMore.id = 'show-more';
          showMore.textContent = loadingMore
            ? 'Loading\\u2026'
            : 'Show more results (' + remaining + ' remaining)';
          showMore.disabled = loadingMore;
          showMore.addEventListener('click', function () {
            if (loadingMore) {
              return;
            }
            loadingMore = true;
            showMore.disabled = true;
            showMore.textContent = 'Loading\\u2026';
            vscode.postMessage({ command: 'loadMore' });
          });
          resultsEl.appendChild(showMore);
        }

        updateCollapseAllLabel();
      }

      function setSearching(value) {
        searching = value;
        searchButton.disabled = value;
        searchButton.textContent = value ? 'Searching\\u2026' : 'Search';
        pickaxeEl.classList.toggle('active', value);
        updateEmptyState();
      }

      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          addTerm(input.value);
          input.value = '';
        } else if (event.key === 'Escape') {
          input.value = '';
        }
      });

      input.addEventListener('input', function () {
        if (input.value.indexOf(',') !== -1) {
          var parts = input.value.split(',');
          input.value = parts.pop();
          parts.forEach(addTerm);
        }
      });

      function doSearch() {
        if (searching) {
          return;
        }
        if (input.value.trim()) {
          addTerm(input.value);
          input.value = '';
        }
        if (terms.length === 0) {
          statusEl.textContent = 'Add at least one term';
          return;
        }
        if (terms.some(function (term) { return term.length < 2; })) {
          statusEl.textContent = 'Terms must be at least 2 characters';
          return;
        }
        setSearching(true);
        statusEl.textContent = 'Searching\\u2026';
        resultsEl.textContent = '';
        clearTimeout(slowSearchTimer);
        slowSearchTimer = setTimeout(function () {
          if (searchTipEl) searchTipEl.style.display = 'block';
        }, 5000);
        stopBtn.style.display = 'block';
        noResultsEl.style.display = 'none';
        vscode.postMessage({
          command: 'search',
          terms: terms.slice(),
          caseSensitive: caseSensitive,
          excludePatterns: excludeTerms.slice(),
          fileTypes: fileTypeInput.value,
          workspaceFolder: workspaceSelect.value || null,
        });
      }

      searchButton.addEventListener('click', doSearch);

      stopBtn.addEventListener('click', function () {
        vscode.postMessage({ command: 'stopSearch' });
      });

      window.addEventListener('message', function (event) {
        var message = event.data;
        if (message.command === 'results') {
          hideSearchTip();
          stopBtn.style.display = 'none';
          if (message.append) {
            results = (results || []).concat(message.results);
            loadingMore = false;
          } else {
            setSearching(false);
            statusEl.textContent = '';
            statusEl.style.color = '';
            results = message.results;
            capped = !!message.capped;
          }
          total = message.total;
          hasMore = message.hasMore;
          updateEmptyState();
          renderResults();
          if (message.cancelled) {
            statusEl.style.color = 'var(--vscode-descriptionForeground)';
            statusEl.textContent =
              'Search stopped \\u2014 ' + total +
              ' files found before stopping. ' +
              'Add exclude patterns to narrow your search.';
          }
        } else if (message.command === 'setCaseSensitive') {
          caseSensitive = !!message.value;
        } else if (message.command === 'setExcludePatterns') {
          excludeTerms = String(message.value || '')
            .split(',')
            .map(function (p) { return p.trim(); })
            .filter(Boolean);
          renderExcludeChips();
          if (excludeTerms.length > 0) {
            setOptionsOpen(true);
          }
        } else if (message.command === 'setFileTypes') {
          fileTypeInput.value = message.value || '';
          if (fileTypeInput.value) {
            setOptionsOpen(true);
          }
        } else if (message.command === 'setWorkspaceFolders') {
          var folders = message.folders || [];
          workspaceSelect.textContent = '';
          var allOption = document.createElement('option');
          allOption.value = '';
          allOption.textContent = 'All folders';
          workspaceSelect.appendChild(allOption);
          folders.forEach(function (folder) {
            var option = document.createElement('option');
            option.value = folder.path;
            option.textContent = folder.name;
            workspaceSelect.appendChild(option);
          });
          workspaceSelect.style.display = 'block';
        } else if (message.command === 'scanCount') {
          statusEl.textContent =
            'Scanning ' + message.count.toLocaleString() + ' files\\u2026';
        } else if (message.command === 'clearResults') {
          clearResults();
        } else if (message.command === 'runSearch') {
          terms = (message.terms || []).slice();
          renderChips();
          doSearch();
        }
      });

      renderChips();
      setOptionsOpen(false);
      statusEl.textContent = 'Add terms above, then search.';
      vscode.postMessage({ command: 'ready' });
    })();
  </script>
</body>
</html>`;
  }
}
