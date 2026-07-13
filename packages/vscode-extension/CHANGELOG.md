# Changelog

## [0.2.1] - 2026-07-13
### Changed
- Added detailed diagnostic logging to ripgrep binary discovery,
  including alternative VS Code install paths

## [0.2.0] - 2026-07-12
### Changed
- Rewrote search engine to use ripgrep for dramatically 
  faster search on large workspaces
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
- Exclude patterns now use chip UI with red styling to 
  clearly communicate exclusion, matching the term chip 
  interaction pattern
- Stop button uses a larger outlined square SVG icon
- Term color palette updated: teal (brand), orange, purple, 
  amber, pink, blue — all clearly distinct from each other 
  and from red exclude chips

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
