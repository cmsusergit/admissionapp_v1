<script lang="ts">
    import { fade } from 'svelte/transition';
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { PUBLIC_SUPABASE_URL } from '$env/static/public';
    import { evaluate } from 'mathjs';

    // Flexible Schema Interface
    interface FormField {
        key: string; // or name
        name?: string;
        label: string;
        type: string;
        required?: boolean;
        col?: number;
        sectionId?: string;
        is_merit?: boolean; // Legacy/List: For merit calculation
        max_score?: number; // Legacy/List: Max score for merit field
        // Select specific
        options?: string[]; // Legacy
        dataSource?: {
            type: 'static' | 'rest';
            options?: { value: string; label: string }[];
            endpoint?: string;
            valueField?: string;
            labelField?: string;
        };
        // Logic
        dependsOn?: string;
        showWhen?: { 
            field: string; 
            operator?: 'equals' | 'notEquals' | 'in';
            equals?: string | string[];  // string[] for 'in' operator
        };
        // Datagrid/Table specific
        column_max_scores?: Record<string, number>;
        inDatagrid?: boolean; // true = datagrid row, false = regular field (default true for table sections)
    }

    interface TableColumn {
        key: string;
        label: string;
        type: 'number' | 'text' | 'calculated';
        formula?: string;
        is_merit?: boolean;
        default_max_score?: number;
    }

    interface FormSection {
        id: string;
        title: string;
        layout?: 'column' | 'table';
        rowHeaderLabel?: string;
        tableColumns?: TableColumn[];
    }

    interface FormSchema {
        layout?: 'tabs' | 'cards' | 'list';
        sections?: FormSection[];
        fields: FormField[];
    }

    let { schema = { fields: [] }, formData = $bindable({}), readonly = false }: { schema: FormSchema; formData: Record<string, any>; readonly: boolean } = $props();

    let errors = $state<Record<string, string>>({});
    let uploadingFields = $state<Record<string, boolean>>({});
    let loadingOptions = $state<Record<string, boolean>>({});
    let activeTabId = $state('');
    let dynamicOptions = $state<Record<string, { value: string; label: string }[]>>({});
    let componentId = Math.random().toString(36).substring(7);
    
    // Compute field key helper
    const getKey = (f: FormField) => f.key || f.name || '';
    
    // Visibility is computed reactively based on formData changes
    // We'll compute it inline in templates using checkVisibility function
    
    // Helper to check if a field is visible - uses formData directly
    function isFieldVisible(field: FormField): boolean {
        if (!field.showWhen) return true;
        const result = checkVisibility(field.showWhen, formData);
        // Debug: log visibility changes
        const key = getKey(field);
        const showWhenField = field.showWhen.field;
        const showWhenValue = formData[showWhenField];
        console.log(`[DynamicForm] Visibility check: ${key} depends on '${showWhenField}' = '${showWhenValue}' => ${result}`);
        return result;
    }
    
    onMount(() => {
        console.debug(`[DynamicForm ${componentId}] Mounted with ${schema.fields?.length || 0} fields`);
        // Debug: log fields with showWhen
        const showWhenFields = schema.fields?.filter(f => f.showWhen) || [];
        if (showWhenFields.length > 0) {
            console.debug(`[DynamicForm ${componentId}] Fields with showWhen:`, showWhenFields.map(f => ({ key: f.key, showWhen: f.showWhen })));
        }
        return () => {
            console.debug(`[DynamicForm ${componentId}] Destroyed`);
        };
    });
    
    $effect(() => {
        if (schema.fields?.length > 0) {
            console.debug(`[DynamicForm ${componentId}] Schema updated: ${schema.fields.length} fields`);
            // Check for duplicate keys in the schema
            const fieldKeys = schema.fields.map(f => getKey(f));
            const duplicateKeys = fieldKeys.filter((key, index) => fieldKeys.indexOf(key) !== index);
            if (duplicateKeys.length > 0) {
                console.warn(`[DynamicForm ${componentId}] WARNING - Duplicate field keys in database schema:`, [...new Set(duplicateKeys)]);
            }
        }
    });

    // Reactivity for initializing formData for merit fields and datagrid
    // Initialize formData for datagrid/merit fields - only runs on first render
    let initialized = false;
    
    $effect(() => {
        // Only run once on initial mount
        if (!initialized && normalizedSchema.fields.length > 0) {
            initialized = true;
            console.log('[DynamicForm] Initializing formData for', normalizedSchema.fields.length, 'fields');
            
            let newFormData = { ...formData };
            let changed = false;
            normalizedSchema.fields.forEach(field => {
                const key = getKey(field);
                const section = normalizedSchema.sections.find(s => s.id === field.sectionId) || normalizedSchema.sections[0];
                const sectionHasTable = section.layout === 'table' && section.tableColumns && section.tableColumns.length > 0;
                const isDatagridField = sectionHasTable && field.inDatagrid === true;

                // Handle DATAGRID fields (inDatagrid === true)
                if (isDatagridField) {
                     // Only initialize if not already an object
                     if (typeof newFormData[key] !== 'object' || newFormData[key] === null) {
                         const existingValue = newFormData[key];
                         newFormData[key] = {};
                         if (existingValue !== undefined && existingValue !== null && section.tableColumns) {
                             const targetCol = section.tableColumns[0]?.key;
                             if (targetCol) {
                                 newFormData[key][targetCol] = existingValue;
                             }
                         }
                         changed = true;
                     }
                     
                     // Ensure merit columns have proper structure
                     section.tableColumns?.forEach(col => {
                         if (col.is_merit) {
                             const existingColVal = newFormData[key]?.[col.key];
                             if (existingColVal && typeof existingColVal === 'object' && 'value' in existingColVal) {
                                 if (existingColVal.max_score === undefined) {
                                     existingColVal.max_score = field.column_max_scores?.[col.key] ?? col.default_max_score ?? 100;
                                 }
                             } else if (existingColVal !== undefined && existingColVal !== null) {
                                 newFormData[key][col.key] = {
                                     value: existingColVal,
                                     max_score: field.column_max_scores?.[col.key] ?? col.default_max_score ?? 100
                                 };
                                 changed = true;
                             }
                         }
                     });
                } else if (field.is_merit && !sectionHasTable) {
                    // Handle MERIT fields outside datagrid (non-table sections only)
                    const currentVal = newFormData[key];
                    if (typeof currentVal !== 'object' || currentVal === null || !('value' in currentVal)) {
                        const existingValue = currentVal;
                        newFormData[key] = {
                            value: existingValue !== undefined ? existingValue : undefined,
                            max_score: field.max_score !== undefined ? field.max_score : 100
                        };
                        changed = true;
                    }
                }
                // REGULAR fields (non-datagrid in table sections, or any field in non-table sections) are NOT wrapped
            });
            
            if (changed) {
                formData = newFormData;
            }
        }
    });

    // Normalize Schema
    let normalizedSchema = $derived({
        layout: schema.layout || 'list',
        sections: (schema.sections && schema.sections.length > 0) 
            ? schema.sections 
            : [{ id: 'default', title: 'General', layout: 'column' as const }],
        fields: schema.fields || []
    });

    $effect(() => {
        if (!activeTabId && normalizedSchema.sections.length > 0) {
            activeTabId = normalizedSchema.sections[0].id;
        }
    });

    // Helper to get fields for a section
    function getFieldsForSection(sectionId: string) {
        return normalizedSchema.fields.filter(f => 
            f.sectionId === sectionId || 
            (!f.sectionId && sectionId === normalizedSchema.sections[0].id)
        );
    }

    // Helper to resolve nested object paths (e.g. 'physics.theory_score')
    function resolvePath(obj: any, path: string) {
        return path.split('.').reduce((o, p) => o ? o[p] : undefined, obj);
    }

    // Helper to check visibility based on showWhen condition
    function checkVisibility(showWhen: NonNullable<FormField['showWhen']>, formData: Record<string, any>): boolean {
        const parentVal = resolvePath(formData, showWhen.field);
        
        // Extract the actual value if it's a merit object
        const checkValue = (parentVal && typeof parentVal === 'object' && 'value' in parentVal) 
            ? parentVal.value 
            : parentVal;
        
        const { operator = 'equals', equals } = showWhen;
        
        if (operator === 'in' && Array.isArray(equals)) {
            return equals.includes(checkValue);
        }
        if (operator === 'notEquals') {
            return checkValue !== equals;
        }
        // Default: equals
        return checkValue === equals;
    }

    // Track formData changes for visibility - using $effect for proper Svelte 5 reactivity
    $effect(() => {
        // Access formData to create dependency
        const _dep = formData;
        console.debug(`[DynamicForm] formData updated (for reactivity):`, JSON.stringify(Object.keys(_dep || {})));
        
        // Also update dependent selects when formData changes
        schema.fields.forEach(field => {
            if (field.type === 'select' && field.dataSource?.type === 'rest' && field.dependsOn) {
                const parentVal = formData[field.dependsOn];
                if (parentVal) {
                    loadDynamicOptions(field, parentVal);
                } else {
                    dynamicOptions[getKey(field)] = [];
                }
            }
        });
    });

    // Reactivity for Dependent Selects
    $effect(() => {
        schema.fields.forEach(field => {
            if (field.type === 'select' && field.dataSource?.type === 'rest' && field.dependsOn) {
                const parentVal = formData[field.dependsOn];
                if (parentVal) {
                    loadDynamicOptions(field, parentVal);
                } else {
                    dynamicOptions[getKey(field)] = [];
                }
            }
        });
    });

    onMount(() => {
        // Load initial options for REST fields without dependencies
        schema.fields.forEach(field => {
            if (field.type === 'select' && field.dataSource?.type === 'rest' && !field.dependsOn) {
                loadDynamicOptions(field);
            }
        });
    });

    async function loadDynamicOptions(field: FormField, parentValue?: string) {
        if (!browser) return; // Prevent server-side fetch
        if (!field.dataSource?.endpoint) return;
        
        const key = getKey(field);
        loadingOptions[key] = true; 
        
        let url = field.dataSource.endpoint;
        if (field.dependsOn && parentValue) {
            url = url.replace(`{${field.dependsOn}}`, parentValue);
        }

        try {
            const res = await fetch(url);
            const data = await res.json();
            const valueKey = field.dataSource.valueField || 'id';
            const labelKey = field.dataSource.labelField || 'name';
            
            dynamicOptions[key] = data.map((item: any) => ({
                value: item[valueKey],
                label: item[labelKey]
            }));
        } catch (e) {
            console.error(`Failed to load options for ${key}`, e);
        } finally {
            loadingOptions[key] = false; 
        }
    }

    function getOptions(field: FormField) {
        const key = getKey(field);
        
        if (dynamicOptions[key]?.length > 0) return dynamicOptions[key];
        
        if (field.dataSource?.options && Array.isArray(field.dataSource.options) && field.dataSource.options.length > 0) {
            return field.dataSource.options;
        }
        
        if (field.options && Array.isArray(field.options) && field.options.length > 0) {
            return field.options.map(o => {
                if (typeof o === 'string') {
                    const parts = o.split('|');
                    const val = parts[0]?.trim();
                    const label = (parts[1] || parts[0])?.trim();
                    return { value: val, label: label };
                }
                if (typeof o === 'object' && o !== null) {
                    return { value: String((o as any).value ?? o), label: String((o as any).label || (o as any).value ?? o) };
                }
                return { value: String(o), label: String(o) };
            });
        }

        return [];
    }

    export function validate() {
        let isValid = true;
        errors = {}; // Reset errors
        normalizedSchema.fields.forEach(field => {
            const key = getKey(field);
            // Only validate visible fields
            if (isFieldVisible(field) && field.required) {
                if (field.is_merit) {
                    if (formData[key] === undefined || formData[key] === null || formData[key].value === undefined || formData[key].value === null || formData[key].value === '') {
                        errors[key] = `${field.label} is required`;
                        isValid = false;
                    }
                } else {
                    if (!formData[key]) {
                        errors[key] = `${field.label} is required`;
                        isValid = false;
                    }
                }
            }
        });
        
        // If validation fails, try to switch to the tab containing the first error (optional UX enhancement)
        if (!isValid && normalizedSchema.layout === 'tabs') {
            const firstErrorKey = Object.keys(errors)[0];
            const errorField = normalizedSchema.fields.find(f => getKey(f) === firstErrorKey);
            if (errorField && errorField.sectionId) {
                activeTabId = errorField.sectionId;
            }
        }

        return isValid;
    }
    
    function clearError(fieldName: string) {
        if (errors[fieldName]) {
            const newErrors = { ...errors };
            delete newErrors[fieldName];
            errors = newErrors;
        }
    }

    async function handleFileDelete(fieldName: string) {
        if (!confirm('Are you sure you want to remove this file?')) return;
        
        const filePath = formData[fieldName];
        if (!filePath) return;

        uploadingFields[fieldName] = true; // Use loading state

        try {
            const response = await fetch('/api/upload', {
                method: 'DELETE',
                body: JSON.stringify({ path: filePath }),
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await response.json();

            if (result.success) {
                delete formData[fieldName];
                formData = { ...formData }; // Trigger reactivity
                clearError(fieldName);
            } else {
                errors[fieldName] = `Delete failed: ${result.message}`;
            }
        } catch (e) {
            console.error(e);
            errors[fieldName] = 'Delete failed due to network error.';
        } finally {
            uploadingFields[fieldName] = false;
        }
    }

    async function handleFileUpload(event: Event, fieldName: string) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
             errors[fieldName] = 'Invalid file type. Only PDF and Images are allowed.';
             return;
        }

        if (file.size > 2 * 1024 * 1024) { 
            errors[fieldName] = 'File size exceeds 2MB limit.';
            return;
        }

        // Check for existing file and delete it first
        if (formData[fieldName]) {
             try {
                await fetch('/api/upload', {
                    method: 'DELETE',
                    body: JSON.stringify({ path: formData[fieldName] }),
                    headers: { 'Content-Type': 'application/json' }
                });
                // We ignore errors here (e.g. if file didn't exist) to allow upload to proceed
             } catch (e) {
                 console.warn('Failed to delete old file before replacement', e);
             }
        }

        uploadingFields[fieldName] = true;
        const data = new FormData();
        data.append('file', file);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: data
            });
            const result = await response.json();

            if (result.success) {
                formData[fieldName] = result.path; 
                clearError(fieldName);
            } else {
                errors[fieldName] = `Upload failed: ${result.message}`;
            }
        } catch (e) {
            console.error(e);
            errors[fieldName] = 'Upload failed due to network error.';
        } finally {
            uploadingFields[fieldName] = false;
        }
    }

    function getCalculatedValue(rowKey: string, formula?: string) {
        if (!formula || !formData[rowKey]) return '';
        try {
            const scope = { ...formData[rowKey] };
            // Convert strings to numbers for evaluation if possible
            for (const k in scope) {
                if (typeof scope[k] === 'string' && !isNaN(Number(scope[k]))) {
                    scope[k] = Number(scope[k]);
                }
            }
            const result = evaluate(formula, scope);
            // Optional: update formData reactively if needed
            // if (formData[rowKey][colKey] !== result) formData[rowKey][colKey] = result;
            return result;
        } catch (e) {
            return '';
        }
    }
</script>

{#snippet fieldControl(field: FormField, fieldId: string, key: string, hideLabel: boolean = false)}
    {#if field.is_merit}
        <div class="row g-2">
            <div class="col-md-6">
                <input
                    type="number"
                    class="form-control"
                    id="{fieldId}-value"
                    name="{key}-value"
                    placeholder="Score"
                    bind:value={formData[key].value}
                    oninput={() => clearError(key)}
                    disabled={readonly}
                />
            </div>
            <div class="col-md-6">
                <input
                    type="number"
                    class="form-control"
                    id="{fieldId}-max-score"
                    name="{key}-max-score"
                    placeholder="Max Score"
                    bind:value={formData[key].max_score}
                    oninput={() => clearError(key)}
                    disabled={readonly}
                />
            </div>
        </div>
    {:else if field.type === 'text' || field.type === 'email' || field.type === 'number' || field.type === 'date'}
        <input
            type={field.type}
            class="form-control"
            id={fieldId}
            name={key}
            bind:value={formData[key]}
            oninput={() => clearError(key)}
            disabled={readonly}
        />
    {:else if field.type === 'textarea'}
        <textarea
            class="form-control"
            id={fieldId}
            name={key}
            bind:value={formData[key]}
            oninput={() => clearError(key)}
            disabled={readonly}
        ></textarea>
    {:else if field.type === 'select'}
        <select
            class="form-select"
            id={fieldId}
            name={key}
            bind:value={formData[key]}
            onchange={() => clearError(key)}
            disabled={readonly || loadingOptions[key] || (!!field.dependsOn && !formData[field.dependsOn])}
        >
            {#if loadingOptions[key]}
                <option value="">Loading...</option>
            {:else}
                <option value="">-- Select {field.label} --</option>
                {#each getOptions(field) as option}
                    <option value={option.value}>{option.label}</option>
                {/each}
            {/if}
        </select>
    {:else if field.type === 'checkbox'}
        <div class="form-check">
            <input
                type="checkbox"
                class="form-check-input"
                id={fieldId}
                name={key}
                bind:checked={formData[key]}
                onchange={() => clearError(key)}
                disabled={readonly}
            />
            {#if !hideLabel}
                <label class="form-check-label" for={fieldId}>{field.label}</label>
            {/if}
        </div>
    {:else if field.type === 'file'}
        <div class="input-group">
            <input
                type="file"
                class="form-control"
                id={fieldId}
                name={key}
                accept="image/*,application/pdf"
                onchange={(e) => handleFileUpload(e, key)}
                disabled={readonly || uploadingFields[key]}
            />
            {#if uploadingFields[key]}
                <span class="input-group-text">
                    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                    Uploading...
                </span>
            {/if}
        </div>
        <div class="form-text">Max size: 2MB. Allowed: PDF, Images.</div>
        {#if formData[key]}
            <div class="mt-1 d-flex align-items-center gap-2">
                <small class="text-success">File uploaded</small>
                <a 
                    href="{PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/{formData[key]}" 
                    target="_blank" 
                    class="btn btn-sm btn-outline-info"
                >
                    View
                </a>
                {#if !readonly}
                    <button 
                        type="button" 
                        class="btn btn-sm btn-outline-danger" 
                        onclick={() => handleFileDelete(key)}
                    >
                        Delete
                    </button>
                {/if}
            </div>
        {:else if uploadingFields[key]}
            <div class="mt-1">
                <small class="text-info">Uploading...</small>
            </div>
        {/if}
    {:else}
        <p class="text-danger">Unsupported field type: {field.type}</p>
    {/if}
{/snippet}

{#snippet sectionContent(section: FormSection)}
    {@const sectionFields = getFieldsForSection(section.id)}
    {@const isTableLayout = section.layout === 'table' && section.tableColumns && section.tableColumns.length > 0}
    {@const regularFields = isTableLayout ? sectionFields.filter(f => !f.inDatagrid) : sectionFields}
    {@const datagridFields = isTableLayout ? sectionFields.filter(f => f.inDatagrid) : []}
    
    <!-- Regular Fields -->
    {#if regularFields.length > 0}
        <div class="row mb-3">
            {#each regularFields as field, fieldIndex}
                {@const key = getKey(field)}
                {@const fieldId = `${section.id}-${key}-${fieldIndex}`}
                {#if isFieldVisible(field)}
                    <div class="{`col-md-${field.col || 12}`} mb-2">
                        <label for={fieldId} class="form-label">
                            {field.label}
                            {#if field.required}<span class="text-danger">*</span>{/if}
                        </label>
                        {@render fieldControl(field, fieldId, key, false)}
                        {#if errors[key]}
                            <div class="text-danger mt-1">{errors[key]}</div>
                        {/if}
                    </div>
                {/if}
            {/each}
        </div>
    {/if}
    
    <!-- Datagrid Table (only for table layout) -->
    {#if isTableLayout && datagridFields.length > 0}
        <div class="table-responsive mb-3">
            <table class="table table-bordered align-middle">
                <thead class="table-light">
                    <tr>
                        <th style="width: 25%">{section.rowHeaderLabel || 'Field Name'}</th>
                        {#each section.tableColumns || [] as col}
                            <th>{col.label}</th>
                            {#if col.is_merit}
                                <th style="width: 15%; min-width: 100px;">{col.label} Max</th>
                            {/if}
                        {/each}
                    </tr>
                </thead>
                <tbody>
                    {#each datagridFields as field, fieldIndex}
                        {@const key = getKey(field)}
                        {@const fieldId = `${section.id}-${key}-${fieldIndex}`}
                        {#if isFieldVisible(field)}
                            <tr>
                                <td>
                                    <label for={fieldId} class="form-label mb-0 fw-semibold">
                                        {field.label}
                                        {#if field.required}<span class="text-danger">*</span>{/if}
                                    </label>
                                </td>
                                {#each section.tableColumns || [] as col}
                                    {@const cellId = `${fieldId}-${col.key}`}
                                    {@const maxScoreId = `${fieldId}-${col.key}-max`}
                                    <td>
                                        {#if col.type === 'calculated'}
                                            {@const calcVal = getCalculatedValue(key, col.formula)}
                                            <input type="text" class="form-control bg-light" readonly value={calcVal} />
                                            <input type="hidden" name={`${key}-${col.key}`} value={calcVal} />
                                        {:else}
                                            <input
                                                type={col.type === 'number' ? 'number' : 'text'}
                                                class="form-control"
                                                id={cellId}
                                                name={`${key}-${col.key}`}
                                                value={col.is_merit ? formData[key]?.[col.key]?.value : formData[key]?.[col.key]}
                                                oninput={(e) => {
                                                    const targetValue = (e.target as HTMLInputElement).value;
                                                    if (col.is_merit) {
                                                        if (!formData[key]) formData[key] = {};
                                                        if (!formData[key][col.key]) formData[key][col.key] = {};
                                                        formData[key][col.key].value = targetValue;
                                                    } else {
                                                        formData[key][col.key] = targetValue;
                                                    }
                                                    clearError(key);
                                                }}
                                                disabled={readonly}
                                            />
                                        {/if}
                                    </td>
                                    {#if col.is_merit}
                                        <td>
                                            <input
                                                type="number"
                                                class="form-control"
                                                id={maxScoreId}
                                                name={`${key}-${col.key}-max`}
                                                value={formData[key]?.[col.key]?.max_score ?? field.column_max_scores?.[col.key] ?? col.default_max_score ?? 100}
                                                min="1"
                                                oninput={(e) => {
                                                    const targetValue = (e.target as HTMLInputElement).value;
                                                    if (!formData[key]) formData[key] = {};
                                                    if (!formData[key][col.key]) formData[key][col.key] = {};
                                                    formData[key][col.key].max_score = parseFloat(targetValue) || 100;
                                                }}
                                                disabled={readonly}
                                            />
                                        </td>
                                    {/if}
                                {/each}
                            </tr>
                        {/if}
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
{/snippet}

<div class="dynamic-form-container">
    {#if normalizedSchema.layout === 'tabs'}
        <ul class="nav nav-tabs mb-3">
            {#each normalizedSchema.sections as section}
                <li class="nav-item">
                    <button 
                        class="nav-link {activeTabId === section.id ? 'active' : ''}"
                        onclick={() => activeTabId = section.id}
                        type="button"
                    >
                        {section.title}
                    </button>
                </li>
            {/each}
        </ul>
        
        <div class="tab-content border p-3 border-top-0 rounded-bottom bg-white">
            {#each normalizedSchema.sections as section}
                <div class="tab-pane fade {activeTabId === section.id ? 'show active' : ''}" style="display: {activeTabId === section.id ? 'block' : 'none'}">
                    {@render sectionContent(section)}
                </div>
            {/each}
        </div>

    {:else if normalizedSchema.layout === 'cards'}
        {#each normalizedSchema.sections as section}
            <div class="card mb-4 shadow-sm">
                <div class="card-header bg-light">
                    <h5 class="mb-0 text-primary">{section.title}</h5>
                </div>
                <div class="card-body">
                    {@render sectionContent(section)}
                </div>
            </div>
        {/each}

    {:else}
        <!-- List Layout (Legacy) -->
        <div class="row">
            {#each schema.fields as field, fieldIndex}
                {@const key = getKey(field)}
                {@const fieldId = `${key}-${fieldIndex}`} 
                {#if isFieldVisible(field)}
                    <div class="{`col-md-${field.col || 12}`} mb-3">
                        <label for={fieldId} class="form-label">
                            {field.label}
                            {#if field.required}<span class="text-danger">*</span>{/if}
                        </label>
                        {@render fieldControl(field, fieldId, key, false)}
                        {#if errors[key]}
                            <div class="text-danger mt-1">{errors[key]}</div>
                        {/if}
                    </div>
                {/if}
            {/each}
        </div>
    {/if}
</div>

<style>
    /* Add any specific styles for dynamic forms here */
    .nav-tabs .nav-link {
        cursor: pointer;
    }
</style>