# Bulk Document Verification Plan (Student-Centric)

This document outlines the revised strategy to implement a "Student-wise Bulk Verification" system. Instead of grouping by document type, this approach groups documents by **Student (Application)**, allowing the officer to verify an entire application's documentation in a single context.

## 1. Objectives
*   **Contextual Verification**: Verify documents while seeing the student's full context (Name, Application ID).
*   **Complete Application Check**: Ensure *all* required documents for a specific student are valid before moving to the next.
*   **Rapid Processing**: "Card-based" interface allowing quick "Approve All" actions per student.

## 2. User Interface (UI) Design

### **Route Structure**
*   **Adm Officer**: `src/routes/adm-officer/verification/bulk`
*   **DEO**: `src/routes/deo/verification/bulk`

### **Page Layout: The "Student Deck"**
Instead of a standard table, we use a **Masonry/Grid of Student Cards**.

#### **1. Filter Bar**
*   **Course/Branch**: Filter to a specific batch (e.g., "Computer Engineering").
*   **Status**: "Pending Verification" (Default).

#### **2. Student Card (The Core Unit)**
Each card represents **One Application**.
*   **Header**: Student Name, Enrollment No, Application ID.
*   **Document Strip**: A horizontal scrollable or wrapped container showing thumbnails of *all* documents uploaded by this student.
    *   **Example**: [10th Marksheet] [12th Marksheet] [Leaving Cert] [Caste Cert]
    *   **Interaction**: Clicking a thumbnail opens a large preview.
    *   **Individual Controls**: 
        *   Hovering over a thumbnail reveals a **"Reject" (X)** icon.
        *   Clicking "Reject" opens a focused modal/popover for *that specific document*.
*   **Card Footer (Actions)**:
    *   **"Verify All & Approve" (Primary Button)**: Marks all documents as `approved` AND sets application status to `verified`.
    *   **"Reject"**: If specific docs are rejected, this flags the application as `needs_correction`.

## 3. Workflow

1.  **Load Batch**: Officer selects "Computer Engineering". System loads 20 pending applications.
2.  **Scan**: Officer looks at the first card.
    *   Scans the 3-4 visible document thumbnails.
    *   If all look good -> Clicks **"Verify All"**.
    *   The card disappears (or turns green/fades out), and the next card shifts focus.
3.  **Exception Handling (Single Document Rejection)**:
    *   If "12th Marksheet" is blurry:
    *   Officer clicks the "Reject" (X) icon on *that specific thumbnail*.
    *   **Rejection Modal**: Prompts for a reason (e.g., "Blurry").
    *   **Action**: Upon confirmation:
        *   Updates specific document status to `rejected`.
        *   Updates overall application status to `needs_correction`.
        *   Visual feedback: Thumbnail gets a red border/badge.
    *   **Impact**: The main "Verify All" button updates to reflect that the application is now flagged for correction.

## 4. Technical Implementation

### **Backend (`+page.server.ts`)**
*   **`load` Function**:
    *   Fetch `applications` where `status = 'submitted'` (Pending).
    *   **Critical Join**: Deep join `documents(*)` for each application.
    *   Return a structured list: `[{ student: ..., documents: [...] }, ...]`
*   **`actions`**:
    *   `verifyStudent`:
        *   Input: `application_id`.
        *   Logic: Update `documents` where `application_id = ID` -> `approved`.
        *   Logic: Update `applications` where `id = ID` -> `verified`.
    *   `rejectDocument`:
        *   Input: `document_id`, `reason`, `application_id`.
        *   Logic: Update specific doc to `rejected` with `rejection_reason`.
        *   Logic: Update application status to `needs_correction`.

### **Frontend (`+page.svelte`)**
*   **Component**: `StudentVerificationCard.svelte` (or inline grid)
    *   Handles the display of the document strip.
    *   Manages local state for "Rejecting" a specific document.
*   **Layout**: CSS Grid to show 2-3 cards per row on large screens for maximum density.

## 5. Benefits
*   **Holistic View**: Prevents approving a student who has a valid ID but a fake marksheet (which might be missed in document-wise sorting).
*   **Fewer Clicks**: 1 Click per Student instead of 1 Click per Document.
*   **Granular Control**: Ability to reject single docs without failing the whole bulk flow.
