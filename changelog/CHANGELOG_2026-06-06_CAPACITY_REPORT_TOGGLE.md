# Changelog - 2026-06-06

## Capacity Report Enhancements & Reactivity Fixes

### Added
- Added a toggle checkbox "Include Unassigned" to the Capacity Report interface.
- Implemented filtering logic to exclude "Unassigned/Other" branches from totals and grand totals by default.

### Changed
- Updated `branchTotal`, `courseMetricTotal`, `grandTotal`, and `grandMetricTotal` calculation helpers to respect the "Include Unassigned" flag.
- Modified PDF export functionality to filter out "Unassigned/Other" branches based on the user's selection.
- Modified Excel export functionality to filter out "Unassigned/Other" branches based on the user's selection.
- Updated both Simple and Detailed UI views to dynamically hide/show "Unassigned/Other" rows and adjust subtotals accordingly.

### Fixed
- Fixed reactivity issue where the **GRAND Total** row would not update immediately upon toggling the "Include Unassigned" checkbox.
- Resolved sync issues between sub-totals and the filtered branch view across different view modes.

### Technical Details
- Added `includeUnassigned` state (boolean) to `src/routes/adm-officer/capacity-report/+page.svelte`.
- Refactored component to use **Svelte Reactive Statements** (`$: filteredCapacityData`, `$: grandTotalCapacity`, etc.) to ensure instant UI updates when state changes.
- Pre-calculates `filteredBranches` for each course to maintain a single source of truth for all display and calculation logic.
- The default state is set to `false`, ensuring that unassigned application counts do not inflate the official intake and admission totals unless explicitly requested.
