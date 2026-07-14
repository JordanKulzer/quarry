# Changelog

## [0.3.0] - 2026-07-13
### Added
- File type filter to restrict search to specific 
  extensions (ts, tsx, py, and so on)
- Workspace folder filter for picking one root or all 
  roots in multi-root workspaces
- Empty state with suggestions when a search finds nothing
### Changed
- Stop button now shows a full "Stop search" label
- Snippet rows dropped the term label since the color 
  coding already identifies the term
- Snippets truncate with an ellipsis instead of wrapping; 
  drag the sidebar wider to see more
- Exclude and file type inputs moved into a collapsible 
  Options section that starts collapsed
- All inputs share the same focus border styling
- Snippet left border is thicker and full opacity

## [0.2.3] - 2026-07-13
### Changed
- Removed diagnostic logging from ripgrep binary discovery;
  only the engine-selection log lines remain

## [0.2.2] - 2026-07-13
### Changed
- Ripgrep discovery now checks all known binary locations
  across Mac, Windows, and Linux: ripgrep-universal, standard
  ripgrep, asar.unpacked variants, Windows install paths, and
  common system locations like /opt/homebrew/bin
- Logs an install tip (brew/choco) when no rg binary is found

## [0.2.1] - 2026-07-13
### Changed
- Added detailed diagnostic logging to ripgrep binary discovery,
  including alternative VS Code install paths

## [0.2.0] - 2026-07-12
### Changed
- Rewrote search engine to use ripgrep for much faster 
  search on large workspaces
- Search now runs in under a second on most repos regardless 
  of size
- Ripgrep respects .gitignore automatically
- Falls back to previous file scanner if ripgrep is 
  not available
### Technical
- Added RipgrepScanner and RipgrepSearchEngine
- Search terms now run in parallel via Promise.all
- Cancellation kills ripgrep child processes cleanly

## [0.1.7] - 2026-07-12
### Changed
- Exclude patterns now use red chips so they read as 
  exclusions at a glance
- Stop button uses a larger outlined square SVG icon
- Term color palette updated: teal, orange, purple, amber, 
  pink, blue, all distinct from each other and from the 
  red exclude chips

## [0.1.6] - 2026-07-12
### Changed
- Stop button restyled to a small square icon next to the 
  Search button instead of a large red button
- Exclude input now full width with a permanent hint showing 
  comma-separated format

## [0.1.5] - 2026-07-12
### Added
- Stop button to cancel an in-progress search and return 
  partial results

## [0.1.4] - 2026-07-12
### Changed
- Match results within each file now sorted by line number 
  instead of grouped by term
- Exclude patterns moved to permanent inline sidebar input 
  for faster access on large repos
- Search status now shows total file count being scanned
- Slow search tip appears after 5 seconds suggesting 
  exclude patterns

## [0.1.3] - 2026-07-12
### Changed
- README images now use absolute GitHub URLs so they 
  render everywhere

## [0.1.2] - 2026-07-12
### Changed
- Rewrote README with clearer copy and better structure

## [0.1.1] - 2026-07-12
### Added
- Demo GIF in README showing multi-term search workflow
### Fixed
- Color coding now consistent per term across all match rows
- Second term color changed from teal to red for better 
  distinction

## [0.1.0] - 2026-07-12
### Added
- Initial release of Quarry
- Multi-term search with color-coded chip UI
- Snippet previews with color-coded terms
- Click to navigate with word highlighting
- Search history with 25-item persistence
- Case sensitive search toggle
- Smart collapse for large result sets
- Result cap at 150 files with warning
