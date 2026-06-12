# Transport Fees Module Implementation Plan

## Objective
Develop an integrated Transport Fees module within the existing SvelteKit application (`admissionapp_v1`) to simplify the collection of transport fees and generation of printed receipts, leveraging the existing Supabase backend and student profile data.

## Background & Motivation
The institution requires a dedicated, lightweight interface for transport fee collection. Instead of routing these payments through the complex main application/admission payment flows, this module will provide a streamlined way to search for a student, collect simple fee heads (e.g., Route, Month), record the transaction, and print a formatted receipt. 

## Scope & Impact
- **Database**: Introduction of a new `transport_fees` table in Supabase.
- **Frontend**: New integrated routes under `/transport`.
- **Impact**: Does not modify existing admission or application payment flows. Adds a separate operational capability for the transport department.

## Proposed Solution

### 1. Database Schema
Create a `transport_fees` table with the following structure:
- `id` (UUID, Primary Key)
- `student_id` (UUID, Foreign Key referencing `users(id)`)
- `enrollment_number` (Text, for quick reference and search)
- `fee_heads` (JSONB, stores an array of objects like `[{ "head": "Bus Fare", "month": "January", "amount": 1500 }]`)
- `total_amount` (Numeric, calculated sum of fee heads)
- `receipt_number` (Text, unique identifier for the printed receipt)
- `payment_date` (Timestamp with time zone, defaults to `now()`)
- `collected_by` (UUID, Foreign Key referencing `users(id)`)

### 2. Application Routes
- **`/transport`**: The landing page for the transport module. Contains a search bar to look up students by their `enrollment_number` or `college_id`.
- **`/transport/collect/[student_id]`**: The fee collection interface. 
  - Displays read-only basic student info (Name, Enrollment Number, Photo if available).
  - Contains a dynamic form to add one or more fee heads (Description, Month, Amount).
  - Calculates the total amount dynamically.
  - Submits the data to the server to create a `transport_fees` record.
- **`/transport/receipt/[id]`**: The receipt view. 
  - Retrieves the `transport_fees` record and associated student details.
  - Styled specifically for printing (using `@media print` CSS rules) with standard college headers, student details, payment breakdown, and signature placeholders.

## Implementation Steps

1. **Database Migration Script**: 
   - Create a SQL script (e.g., `new_database/transport_fees_setup.sql`) to define the `transport_fees` table, create necessary indexes (on `student_id` and `enrollment_number`), and establish RLS policies for secure access.

2. **Search Interface (`/transport`)**:
   - Create `src/routes/transport/+page.svelte` and `+page.server.ts`.
   - Implement server-side search logic querying `users` and `student_profiles` based on the search query.

3. **Collection Form (`/transport/collect/[student_id]`)**:
   - Create `src/routes/transport/collect/[student_id]/+page.svelte` and `+page.server.ts`.
   - Implement the dynamic frontend form for fee heads.
   - Implement form action in `+page.server.ts` to insert the new record into the `transport_fees` table, generating a unique `receipt_number` (e.g., `TRN-YYYYMMDD-XXXX`).

4. **Printable Receipt (`/transport/receipt/[id]`)**:
   - Create `src/routes/transport/receipt/[id]/+page.svelte` and `+page.server.ts`.
   - Design the receipt layout with a focus on printability (hide navigation bars, adjust margins).

## Verification & Testing
1. **Search Test**: Verify that searching by exact and partial `enrollment_number` correctly resolves to a student.
2. **Collection Test**: Verify that adding multiple fee heads correctly calculates the total, and submitting the form persists the data accurately to the database.
3. **Receipt Test**: Verify that the receipt page loads correctly with all data and that the browser's print preview formats the document cleanly as a standard receipt.