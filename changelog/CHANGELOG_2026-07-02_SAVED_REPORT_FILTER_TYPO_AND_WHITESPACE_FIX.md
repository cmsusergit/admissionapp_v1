# Changelog - July 2, 2026

## Summary of Changes
This changelog details the fix for the duplicate options and missing "COMPUTER ENGINEERING" option when filtering by course in the Saved Report template rendering pages.

---

## 1. Saved Report Option Deduplication (Trailing Whitespace)
* **Target Pages**: Saved Report rendering pages for Admission Officer, DEO, and Fee Collector.
* **Problem**: The master database `branches` table contains branch name entries with trailing spaces (e.g. `'COMPUTER ENGINEERING '` and `'ELECTRICAL ENGINEERING '`). When dynamically loading selection parameters for saved templates, a `Set` deduplicates options based on exact strings. Since the template parameter configs had `'COMPUTER ENGINEERING'` (no trailing space) and the database query returned `'COMPUTER ENGINEERING '`, they both remained in the option list, appearing as duplicate dropdown choices in the UI.
* **Fix**: Standardized option parameter building on the server side by trimming all entries when populating `uniqueValues`. This automatically merges trailing-space duplicates.
  * Files modified:
    * [src/routes/adm-officer/saved-reports/\[id\]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/adm-officer/saved-reports/%5Bid%5D/+page.server.ts#L33-L71)
    * [src/routes/deo/saved-reports/\[id\]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/deo/saved-reports/%5Bid%5D/+page.server.ts#L29-L64)
    * [src/routes/fee-collector/saved-reports/\[id\]/+page.server.ts](file:///workspaces/admissionapp_v1/src/routes/fee-collector/saved-reports/%5Bid%5D/+page.server.ts#L29-L64)

## 2. Multi-Course Branch Mapping (Overwrite Fix)
* **Problem**: Multiple courses share the same branch name (e.g. `COMPUTER ENGINEERING` belongs to both `BE` and `DIP`). The helper map `branchCourseMapping` mapped branch names to a single course string (`Record<string, string>`). The last iterated course (e.g. `DIPLOMA ENGINEERING`) would overwrite the mapping, causing `COMPUTER ENGINEERING` to be filtered out and not display when the other course (`BACHELOR OF ENGINEERING` / `BE`) was selected.
* **Fix**:
  * Updated `branchCourseMapping` to map to an array of course names (`Record<string, string[]>`) so that a branch can belong to multiple courses.
  * Updated Svelte view pages to evaluate the mapped course arrays using `mappedCourses.some()` during dynamic option filtering.
  * Files modified:
    * Server files: Same +page.server.ts files listed above.
    * Svelte files:
      * [src/routes/adm-officer/saved-reports/\[id\]/+page.svelte](file:///workspaces/admissionapp_v1/src/routes/adm-officer/saved-reports/%5Bid%5D/+page.svelte#L54-L60)
      * [src/routes/deo/saved-reports/\[id\]/+page.svelte](file:///workspaces/admissionapp_v1/src/routes/deo/saved-reports/%5Bid%5D/+page.svelte#L40-L44)
      * [src/routes/fee-collector/saved-reports/\[id\]/+page.svelte](file:///workspaces/admissionapp_v1/src/routes/fee-collector/saved-reports/%5Bid%5D/+page.svelte#L40-L44)
