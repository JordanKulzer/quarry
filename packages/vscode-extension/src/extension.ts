import * as vscode from 'vscode';
import { QuarryPanel } from './QuarryPanel';

export function activate(context: vscode.ExtensionContext) {
  const panel = new QuarryPanel(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(QuarryPanel.viewType, panel)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('quarry.focus', () => {
      vscode.commands.executeCommand('quarry.searchPanel.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('quarry.openMenu', async () => {
      const picks: (vscode.QuickPickItem & { action: string })[] = [
        { label: '$(history) Recent Searches', action: 'history' },
        {
          label: `$(case-sensitive) Case Sensitive: ${panel.caseSensitive ? 'On' : 'Off'}`,
          action: 'case',
        },
        { label: '$(clear-all) Clear History', action: 'clearHistory' },
        { label: '$(close) Clear Results', action: 'clearResults' },
      ];
      const pick = await vscode.window.showQuickPick(picks, {
        placeHolder: 'Quarry options',
      });
      if (!pick) {
        return;
      }
      switch (pick.action) {
        case 'history': {
          const history = context.globalState.get<string[][]>(panel.historyKey, []);
          if (!history.length) {
            vscode.window.showInformationMessage('Quarry: no recent searches.');
            return;
          }
          const item = await vscode.window.showQuickPick(
            history.map((terms, index) => ({
              label: terms.join(' + '),
              index,
            })),
            { placeHolder: 'Recent searches' }
          );
          if (item) {
            panel.postMessage({ command: 'runSearch', terms: history[item.index] });
          }
          break;
        }
        case 'case': {
          panel.caseSensitive = !panel.caseSensitive;
          panel.postMessage({
            command: 'setCaseSensitive',
            value: panel.caseSensitive,
          });
          break;
        }
        case 'clearHistory': {
          await context.globalState.update(panel.historyKey, []);
          break;
        }
        case 'clearResults': {
          panel.postMessage({ command: 'clearResults' });
          break;
        }
      }
    })
  );

  console.log('Quarry activated');
}

export function deactivate() {}
