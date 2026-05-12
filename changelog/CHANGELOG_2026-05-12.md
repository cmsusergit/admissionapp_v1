# Changelog: Payment System & Report UI Refinement
**Date:** 2026-05-12

## Summary of Changes
This session focused on improving the fee collection workflow for fee collectors, refining receipt presentation, and optimizing administrative reports for better visibility.

### 1. Fee Collection (Record Payment Modal)
*   **Two-Column Layout Refactor:** Completely redesigned the "Record Payment" modal into a high-density two-column layout.
    *   **Left Pane:** Added a dynamic "Student & Fee Summary" including student profile info, detailed component-wise fee breakdown, and a visual payment progress bar.
    *   **Right Pane:** Grouped all input fields into a numbered sequential workflow for faster entry.
*   **Half/Full Fee Support:** 
    *   Implemented a "YEAR" vs "SEMESTER" selection toggle.
    *   Added logic to dynamically update "Total Due" and "Remaining Due" based on the selection.
    *   Implemented component-wise fee splitting (One-time fees 100%, recurring fees 50% for semesters).
*   **Persistence:** Updated server actions to save the `fee_period` selection into the `payments` table.

### 2. PDF Receipt Generation
*   **Horizontal Header Alignment:** Refactored the PDF header for Tuition and Admission receipts to place the College/University logo and header text side-by-side in a single row.
*   **Gated Logic:** Ensured that "YEAR/SEMESTER" labels and splitting logic only apply to Tuition/Admission fees, leaving Provisional and Application receipts in their standard formats.
*   **Logo Priority:** Hardened logo loading logic with async pre-fetching to prevent connection timeout issues.

### 3. Administrative Reports (Capacity Report)
*   **UI Redesign:** Refactored the `adm-officer` Capacity Report.
    *   Replaced the horizontal course tabs with vertically stacked cards.
    *   Course titles and summary stats are now prominently displayed in card headers.
    *   Tables are directly visible, removing the need for extra navigation clicks.

### 4. Bug Fixes & Improvements
*   **Payment History Table:** Fixed an issue where payment mode labels (CASH, ONLINE) were missing; labels are now correctly rendered alongside amounts.
*   **Number-to-Words:** Improved currency formatting logic to handle decimals and zero-value fallbacks accurately.
*   **Database:** Created a manual SQL migration script (`new_database/halffullfeepayment.sql`) for the new `fee_period` column.

## Pending Tasks
*   **Receipt Sequences:** Documented a fix for non-sequential application fee numbers (timestamp fallback bug). Implementation pending user approval of the database constraint change.
