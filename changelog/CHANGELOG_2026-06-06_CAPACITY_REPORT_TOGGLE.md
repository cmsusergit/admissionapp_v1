# Changelog - 2026-06-06

## Capacity Report Enhancements & Reactivity Fixes

### Added
- Added a toggle checkbox "Include Unassigned" to the Capacity Report interface.
- Implemented filtering logic to exclude "Unassigned/Other" branches from totals and grand totals by default.
- **Fee Collector Profile Viewing**: Enabled Fee Collectors to view and print student profiles directly from the payments table using allowed HTML templates.
- **Visual Builder Live-Sync**: Implemented real-time HTML preview and Side-by-Side mode for the Report Builder.

### Changed
- Updated `branchTotal`, `courseMetricTotal`, `grandTotal`, and `grandMetricTotal` calculation helpers to respect the "Include Unassigned" flag.
- Modified PDF export functionality to filter out "Unassigned/Other" branches based on the user's selection.
- Modified Excel export functionality to filter out "Unassigned/Other" branches based on the user's selection.
- Updated both Simple and Detailed UI views to dynamically hide/show "Unassigned/Other" rows and adjust subtotals accordingly.
- Refactored `VisualBuilder` sidebar to a manual drawer-style toggle for improved canvas workspace.

### Fixed
- Fixed reactivity issue where the **GRAND Total** row would not update immediately upon toggling the "Include Unassigned" checkbox.
- Resolved sync issues between sub-totals and the filtered branch view across different view modes.
- Fixed blank canvas issue in Visual Builder when pasting raw HTML code.

### Technical Details
- Added `includeUnassigned` state (boolean) to `src/routes/adm-officer/capacity-report/+page.svelte`.
- Refactored component to help with Svelte Reactive Statements (`$: filteredCapacityData`, `$: grandTotalCapacity`, etc.) to ensure instant UI updates when state changes.
- Pre-calculates `filteredBranches` for each course to maintain a single source of truth for all display and calculation logic.
- Updated `src/routes/print-profile/[applicationId]/+page.server.ts` to authorize `fee_collector` for profile rendering.
- Implemented robust form-type matching and fallback logic for profile templates in the Fee Collector view.
- Fixed a data-fetching bug where `form_type` was missing from the payments query, preventing template linkage.


