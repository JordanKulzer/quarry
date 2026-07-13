# Changelog

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
- README images now use absolute GitHub URLs so they render everywhere

## [0.1.2] - 2026-07-12
### Changed
- Rewrote README with clearer copy and better structure

## [0.1.1] - 2026-07-12
### Added
- Demo GIF in README showing multi-term search workflow
### Fixed
- Color coding now consistent per term across all match rows
- Second term color changed from teal to red for better distinction

## [0.1.0] - 2026-07-12
### Added
- Multi-term search with color-coded chip UI
- Snippet previews showing exact match location per term
- Click any snippet to open file and jump to that line
- Word highlight in editor on navigation (3 second fade)
- Up to 5 match occurrences per term per file
- Search history with 25-item persistence across sessions
- Case sensitive search toggle via ⋯ menu
- Smart collapse for large result sets (>10 files)
- Result cap at 150 files with narrowing suggestion
- Empty state with branded icon
- Match count badge per file
- Expand all / Collapse all controls
- Excludes node_modules, .git, dist, out, .next, build
