# Quarry

Search your codebase for files that contain multiple terms at once.

Add terms as color-coded chips, run a search, and Quarry shows 
every file in your workspace that contains all of them. Each result 
shows snippet previews so you can see exactly where each term 
appears, and clicking any snippet opens the file at that line.

![Quarry demo](https://raw.githubusercontent.com/JordanKulzer/quarry/main/packages/vscode-extension/media/screenshots/quarry-demo.gif)

![Quarry home](https://raw.githubusercontent.com/JordanKulzer/quarry/main/packages/vscode-extension/media/screenshots/home.png)

## Why Quarry?

VS Code's built-in search works great for one pattern at a time. 
But when you need to find where multiple concepts overlap, like 
files that mention both "auth" and "token" and "expiry", you end 
up running searches one at a time and cross-referencing manually. 
Quarry does it in one shot.

![Quarry search results](https://raw.githubusercontent.com/JordanKulzer/quarry/main/packages/vscode-extension/media/screenshots/search.png)

## Features

- Add multiple search terms as color-coded chips
- See up to 5 matches per term per file, with snippet previews
- Click any match to open the file at that exact line
- Matched word highlights in the editor for a few seconds
- Search history saved across sessions, one click to re-run
- Case sensitive search via the options menu
- Custom exclude patterns so you can skip folders you don't care about
- Results capped at 150 files to keep things fast

![Quarry select](https://raw.githubusercontent.com/JordanKulzer/quarry/main/packages/vscode-extension/media/screenshots/select.png)

## How to use it

1. Click the Quarry pickaxe icon in the Activity Bar
2. Type a term and press Enter
3. Add more terms the same way
4. Click Search
5. Click any result to jump to that line

![Quarry menu](https://raw.githubusercontent.com/JordanKulzer/quarry/main/packages/vscode-extension/media/screenshots/menu.png)

## Tips

- Too many results? Add another term to narrow it down
- Use the options menu to re-run recent searches or toggle 
  case sensitivity
- Terms need to be at least 2 characters

## Issues

Report bugs at github.com/JordanKulzer/quarry/issues

## Release Notes

### 0.1.7
- Exclude patterns now use a chip UI with red styling to 
  clearly communicate exclusion, matching the term chip 
  interaction pattern
- Stop button uses a larger outlined square SVG icon
- Term color palette updated: teal (brand), orange, purple, 
  amber, pink, blue

### 0.1.6
- Stop button restyled to a small square icon next to the 
  Search button instead of a large red button
- Exclude input now full width with a permanent hint showing 
  comma-separated format

### 0.1.5
- Added a Stop button to cancel an in-progress search and 
  return partial results

### 0.1.4
- Match results within each file now sorted by line number 
  instead of grouped by term
- Exclude patterns moved to a permanent inline sidebar input
- Search status now shows the total file count being scanned
- Slow search tip appears after 5 seconds suggesting 
  exclude patterns

### 0.1.3
- README images now use absolute GitHub URLs so they 
  render everywhere

### 0.1.2
- Rewrote README with clearer copy and better structure

### 0.1.1
- Added demo GIF to README
- Fixed term color coding to be consistent across all matches

### 0.1.0
- Initial release
