# Quarry

A VS Code extension that lets you add multiple search terms, 
find every file containing all of them, and jump straight to 
the matching lines.

Instead of running separate searches and cross-referencing the 
results yourself, you add each term as a chip and run one search. 
Each term gets its own color, and clicking any match takes you 
to that line in the editor.

[Install from the VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=jordankulzer.quarry-vscode)

## Packages

- `packages/core`: the search engine, with no dependency on VS Code
- `packages/vscode-extension`: the extension itself
