# Datagrid Column Mapping & Merit Score - Implementation Log

## Date: April 12, 2026

This document logs all implementation changes made to support enhanced datagrid column mapping for merit scores.

---

## 1. FormBuilder.svelte Updates

### File: `src/lib/components/FormBuilder.svelte`

#### 1.1 Interface Updates (Lines 4-18)

Extended the `tableColumns` type in the schema interface to include merit-related properties:

```typescript
tableColumns?: {
    key: string;
    label: string;
    type: string;
    formula?: string;
    is_merit?: boolean;          // NEW: Marks column as merit-scored
    default_max_score?: number;  // NEW: Default max score for column
}[]
```

#### 1.2 Reactive Merit Column Detection (Lines 32-49)

Added reactive detection of merit columns when editing fields in table sections:

```typescript
$: currentSectionMeritColumns = (() => {
  const section = schema.sections?.find((s) => s.id === sectionId);
  if (section?.layout === "table" && section.tableColumns) {
    return section.tableColumns.filter(
      (col) => col.is_merit && col.default_max_score,
    );
  }
  return [];
})();
```

#### 1.3 Save Row-Specific Overrides (Lines 199-210)

Updated `constructCustomFieldObject()` to save `column_max_scores` when different from defaults:

```typescript
// Table Section: Save row-specific max score overrides for merit columns
if (isTableSection && currentSectionMeritColumns.length > 0) {
  const hasOverrides = Object.entries(columnMaxScores).some(
    ([colKey, score]) => {
      const col = currentSectionMeritColumns.find((c) => c.key === colKey);
      return score !== (col?.default_max_score || 100);
    },
  );
  if (hasOverrides) {
    field.column_max_scores = { ...columnMaxScores };
  }
}
```

#### 1.4 Load Row-Specific Overrides (Lines 275-286)

Updated `editField()` to load existing `column_max_scores` when editing:

```typescript
// Load column_max_scores for table sections
if (isTableSection && currentSectionMeritColumns.length > 0) {
  if (field.column_max_scores) {
    columnMaxScores = { ...field.column_max_scores };
  } else {
    // Initialize with defaults
    const defaults: Record<string, number> = {};
    currentSectionMeritColumns.forEach((col) => {
      defaults[col.key] = col.default_max_score || 100;
    });
    columnMaxScores = defaults;
  }
}
```

#### 1.5 UI Section for Max Score Overrides (Lines 615-636)

Added UI block in the Add/Edit Field modal for row-specific max score overrides:

```svelte
<!-- Table Section: Row-specific Max Score Overrides for Merit Columns -->
{#if isTableSection && currentSectionMeritColumns.length > 0}
    <div class="mt-3 p-2 border rounded bg-light">
        <h6><i class="bi bi-table me-1"></i>Table Section: Max Score Overrides</h6>
        <p class="small text-muted mb-2">Override default max scores for this row (field) in the table.</p>
        {#each currentSectionMeritColumns as col}
            <div class="row g-2 mb-2 align-items-center">
                <div class="col-6">
                    <label class="form-label small mb-0">
                        {col.label}
                        <span class="text-muted">(default: {col.default_max_score || 100})</span>
                    </label>
                </div>
                <div class="col-6">
                    <input type="number" class="form-control form-control-sm"
                           bind:value={columnMaxScores[col.key]} min="1" />
                </div>
            </div>
        {/each}
    </div>
{/if}
```

---

## 2. DynamicForm.svelte Updates

### File: `src/lib/components/DynamicForm.svelte`

#### 2.1 Visual Badge for Custom Max Scores (Lines 596-598)

Added "Custom" badge to datagrid rows that have row-specific max score overrides:

```svelte
{#if field.column_max_scores && Object.keys(field.column_max_scores).length > 0}
    <span class="badge bg-info ms-1" title="This row has custom max scores">Custom</span>
{/if}
```

---

## 3. Merit Formulas Page Updates

### File: `src/routes/admin/merit-formulas/+page.svelte`

#### 3.1 Svelte 5 Runes Migration

Updated to use Svelte 5 runes for proper reactivity:

```typescript
// Changed from: export let data: PageData;
// To:
let { data }: { data: PageData } = $props();

// Changed reactive variables to use $state:
let showAddModal = $state(false);
let showEditModal = $state(false);
let showDeleteModal = $state(false);
let selectedCourseIdForAdd = $state("");
let selectedFormTypeForAdd = $state("Provisional");
let selectedModeForAdd = $state("weighted");
let addExpressionStr = $state("");

// Changed $: to $derived:
let addModalMeritFields = $derived(
  getMeritFields(selectedCourseIdForAdd, selectedFormTypeForAdd),
);
let editModalMeritFields = $derived(
  getMeritFields(
    $currentMeritFormula.course_id,
    $currentMeritFormula.form_type,
  ),
);
```

#### 3.2 Enhanced Merit Field Detection (Lines 27-74)

Added interface and function to detect merit fields from both table and column layouts:

```typescript
interface MeritFieldEntry {
  key: string;
  label: string;
  type: "table" | "column";
  sectionTitle?: string;
  columnLabel?: string;
}

function getMeritFields(courseId: string, formType: string): MeritFieldEntry[] {
  // Extracts merit fields from:
  // 1. Table layout columns (flattened keys like 'physics_theory')
  // 2. Column layout direct merit fields
}
```

#### 3.3 Fixed Template Scope Issue (Lines 244-250, 353-359)

Fixed "field is not defined" error by removing loop-variable references from outside `{#each}` blocks:

```svelte
<!-- BEFORE (caused error): -->
<small>{#if selectedModeForAdd === 'weighted'}For table fields, use <code>weight_{field.key}</code>{/if}</small>

<!-- AFTER (correct): -->
<small>Click a field to insert it into your formula. Weight will be added to JSON.</small>
```

---

## 4. Merit Calculation Engine (Pre-existing)

### File: `src/lib/server/merit.ts`

The merit calculation engine already handles nested datagrid structures via `flattenContext()`:

```typescript
const flattenContext = (obj: any, prefix = "") => {
  for (const [key, val] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key;
    if (
      typeof val === "object" &&
      val !== null &&
      "value" in val &&
      "max_score" in val
    ) {
      // Structured Merit Field
      context[newKey] = Number(val.value) || 0;
      context[`${newKey}_max`] = Number(val.max_score) || 1;
    } else if (typeof val === "object" && val !== null) {
      // Nested datagrid or object - recurse
      flattenContext(val, newKey);
    }
  }
};
flattenContext(app.form_data);
```

This creates flattened keys like:

- `physics_theory` (value)
- `physics_theory_max` (max score)

---

## 5. Server-Side Updates

### File: `src/routes/admin/merit-formulas/+page.server.ts`

Updated to fetch admission forms with schema for merit field detection:

```typescript
const { data: admissionForms, error: formsError } = await supabase
  .from("admission_forms")
  .select("course_id, form_type, schema_json");
```

---

## Summary of Data Flow

### Creating a Merit Formula with Table Layout:

1. **Admin creates form** with table section containing merit columns (e.g., "Theory" with `default_max_score: 70`)

2. **Admin adds row field** (e.g., "Physics") to table section
   - FormBuilder auto-detects merit columns
   - Shows UI for row-specific max score overrides
   - Saves `column_max_scores: { theory: 70 }` to field

3. **Student fills form** with table layout
   - FormData structure: `formData['physics'] = { theory: { value: 60, max_score: 70 } }`

4. **Admin creates merit formula**
   - Page auto-detects all merit fields (table & column layouts)
   - Admin selects fields to insert into formula
   - Formula saved as: `{ mode: 'expression', expression: '(physics_theory / physics_theory_max) * 100' }`

5. **Merit calculation runs**
   - `flattenContext()` creates context variables
   - `mathjs.evaluate()` computes final score

---

## Key Files Modified

| File                                              | Changes                                                  |
| ------------------------------------------------- | -------------------------------------------------------- |
| `src/lib/components/FormBuilder.svelte`           | Interface, reactivity, save/load overrides, UI section   |
| `src/lib/components/DynamicForm.svelte`           | Visual badge for custom rows                             |
| `src/routes/admin/merit-formulas/+page.svelte`    | Svelte 5 runes, enhanced field detection, template fixes |
| `src/routes/admin/merit-formulas/+page.server.ts` | Fetch admission forms with schema                        |

---

## Notes

- Backward compatible with existing column-layout merit fields
- Row-specific overrides only saved when different from column defaults
- Merit formulas can reference both table (flattened) and column (direct) fields
- UI uses badges to differentiate: `btn-outline-info` for table, `btn-outline-secondary` for column

---

## 6. Receipt Sequence Management UI

### Date: April 12, 2026

Added admin UI for managing receipt sequences (edit, reset, delete).

### Files Created

#### `src/routes/admin/receipt-sequences/+page.server.ts`

Server-side load and form actions:

- **Load**: Fetches receipt_sequences with joins (colleges, courses, academic_years), plus paymentTypes list
- **Actions**: create, update, reset, delete

#### `src/routes/admin/receipt-sequences/+page.svelte`

Client-side UI with:

- Filter section (College, Academic Year, Payment Type, Course)
- Table view of all sequences with preview
- Edit modal (prefix, current sequence)
- Reset button (to 0)
- Delete button
- Add modal for new sequences

### Navigation Updated

#### `src/lib/config/navigation.ts`

Added navigation item under admin section:

```typescript
{ title: "Receipt Sequences", href: "/admin/receipt-sequences", icon: "bi-receipt" },
```

### Features

- **Filter**: Filter sequences by college, year, payment type, course
- **View**: See current sequence number and preview of next receipt
- **Edit**: Update prefix and current sequence number
- **Reset**: Reset sequence to 0 with confirmation
- **Delete**: Remove sequence configuration
- **Create**: Add new sequence configuration

### Database Schema

```sql
receipt_sequences:
  - id (UUID, PK)
  - college_id (UUID, FK)
  - course_id (UUID, FK) - optional
  - payment_type (TEXT) - application_fee, provisional_fee, tuition_fee, etc.
  - academic_year_id (UUID, FK)
  - current_sequence (INTEGER, default 0)
  - prefix (TEXT, default 'REC-')
  - UNIQUE(college_id, payment_type, academic_year_id)
```

### Notes

- Admin only access (same as admission-sequences)
- Course field is optional for generic numbering
- Preview shows what the next receipt number would look like
