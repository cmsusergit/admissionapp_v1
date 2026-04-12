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
        is_merit?: boolean; // New: For merit calculation
        max_score?: number; // New: Max score for merit field
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
        showWhen?: { field: string; equals: string };
    }

    interface TableColumn {
        key: string;
        label: string;
        type: 'number' | 'text' | 'calculated';
        formula?: string;
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

    export let schema: FormSchema = { fields: [] };
    export let formData: Record<string, any> = {};
    export let readonly: boolean = false; // New prop for read-only mode

    let errors: Record<string, string> = {};
    let uploadingFields: Record<string, boolean> = {};
    let loadingOptions: Record<string, boolean> = {};
    let activeTabId: string = '';
    
    // Debug: Track component initialization
    let componentId = Math.random().toString(36).substring(7);
    
    // State for Select Options (dynamic loading)
    let dynamicOptions: Record<string, { value: string; label: string }[]> = {};
    
    // Compute field key helper
    const getKey = (f: FormField) => f.key || f.name || '';
    
    // Initialize visibility and dynamic options
    let visibleFields: Record<string, boolean> = {};
    
    onMount(() => {
        console.debug(`[DynamicForm ${componentId}] Mounted with ${schema.fields?.length || 0} fields`);
        return () => {
            console.debug(`[DynamicForm ${componentId}] Destroyed`);
        };
    });
    
    $: {
        if (schema.fields?.length > 0) {
            console.debug(`[DynamicForm ${componentId}] Schema updated: ${schema.fields.length} fields`);
            // Check for duplicate keys in the schema
            const fieldKeys = schema.fields.map(f => getKey(f));
            const duplicateKeys = fieldKeys.filter((key, index) => fieldKeys.indexOf(key) !== index);
            if (duplicateKeys.length > 0) {
                console.warn(`[DynamicForm ${componentId}] WARNING - Duplicate field keys in database schema:`, [...new Set(duplicateKeys)]);
            }
        }
    }

    // Reactivity for initializing formData for merit fields and datagrid
    $: {
        let newFormData = { ...formData };
        let changed = false;
        normalizedSchema.fields.forEach(field => {
            const key = getKey(field);
            const section = normalizedSchema.sections.find(s => s.id === field.sectionId) || normalizedSchema.sections[0];
            const isDatagrid = section.layout === 'table' && section.tableColumns && section.tableColumns.length > 0;

            if (isDatagrid) {
                 if (typeof newFormData[key] !== 'object' || newFormData[key] === null) {
                     const existingValue = newFormData[key];
                     newFormData[key] = {};
                     // Map existing primitive value to the first datagrid column or a 'value' column if it exists
                     if (existingValue !== undefined && existingValue !== null && section.tableColumns) {
                         const targetCol = section.tableColumns.find(c => c.key === 'value')?.key || section.tableColumns[0]?.key;
                         if (targetCol) newFormData[key][targetCol] = existingValue;
                     }
                     changed = true;
                 }
                 if (field.is_merit && newFormData[key].max_score === undefined) {
                     newFormData[key].max_score = field.max_score !== undefined ? field.max_score : 100;
                     changed = true;
                 }
            } else if (field.is_merit) {
                // If it's a merit field and not already an object, convert it
                if (typeof newFormData[key] !== 'object' || newFormData[key] === null || !('value' in newFormData[key])) {
                    const existingValue = newFormData[key]; // Might be undefined or a primitive value
                    newFormData[key] = {
                        value: existingValue !== undefined ? existingValue : undefined,
                        max_score: field.max_score !== undefined ? field.max_score : 100
                    };
                    changed = true;
                }
            }
        });
        if (changed) {
            formData = newFormData;
        }
    }

    // Normalize Schema
    $: normalizedSchema = {
        layout: schema.layout || 'list',
        sections: (schema.sections && schema.sections.length > 0) 
            ? schema.sections 
            : [{ id: 'default', title: 'General', layout: 'column' as const }],
        fields: schema.fields || []
    };

    $: if (!activeTabId && normalizedSchema.sections.length > 0) {
        activeTabId = normalizedSchema.sections[0].id;
    }

    // Helper to get fields for a section
    $: getFieldsForSection = (sectionId: string) => {
        return normalizedSchema.fields.filter(f => 
            f.sectionId === sectionId || 
            (!f.sectionId && sectionId === normalizedSchema.sections[0].id)
        );
    };

    // Reactivity for Visibility
    $: {
        schema.fields.forEach(field => {
            const key = getKey(field);
            if (field.showWhen) {
                const parentVal = formData[field.showWhen.field];
                visibleFields[key] = parentVal === field.showWhen.equals;
            } else {
                visibleFields[key] = true;
            }
        });
    }

    // Reactivity for Dependent Selects
    $: {
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
    }

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
        if (dynamicOptions[key]) return dynamicOptions[key];
        
        if (field.dataSource?.type === 'static' && field.dataSource.options) {
            return field.dataSource.options;
        }

        if (field.options) {
            return field.options.map(o => {
                if (typeof o === 'string') {
                    const parts = o.split('|');
                    const val = parts[0]?.trim();
                    const label = (parts[1] || parts[0])?.trim();
                    return { value: val, label: label };
                }
                return { value: o, label: o };
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
            if (visibleFields[key] && field.required) {
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
                    on:input={() => clearError(key)}
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
                    on:input={() => clearError(key)}
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
            on:input={() => clearError(key)}
            disabled={readonly}
        />
    {:else if field.type === 'textarea'}
        <textarea
            class="form-control"
            id={fieldId}
            name={key}
            bind:value={formData[key]}
            on:input={() => clearError(key)}
            disabled={readonly}
        ></textarea>
    {:else if field.type === 'select'}
        <select
            class="form-select"
            id={fieldId}
            name={key}
            bind:value={formData[key]}
            on:change={() => clearError(key)}
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
                on:change={() => clearError(key)}
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
                on:change={(e) => handleFileUpload(e, key)}
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
                        on:click={() => handleFileDelete(key)}
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
    {#if section.layout === 'table'}
        {@const sectionFields = getFieldsForSection(section.id)}
        {@const hasMerit = sectionFields.some(f => f.is_merit)}
        {@const isDatagrid = section.tableColumns && section.tableColumns.length > 0}
        <div class="table-responsive mb-3">
            <table class="table table-bordered align-middle">
                <thead class="table-light">
                    <tr>
                        {#if isDatagrid}
                            <th style="width: 25%">{section.rowHeaderLabel || 'Field Name'}</th>
                            {#each section.tableColumns || [] as col}
                                <th>{col.label}</th>
                            {/each}
                            {#if hasMerit}
                                <th style="width: 20%">Max Score</th>
                            {/if}
                        {:else}
                            <th style="width: 30%">Field Name</th>
                            <th>Value</th>
                            {#if hasMerit}
                                <th style="width: 20%">Max Score</th>
                            {/if}
                        {/if}
                    </tr>
                </thead>
                <tbody>
                    {#each sectionFields as field, fieldIndex}
                        {@const key = getKey(field)}
                        {@const fieldId = `${section.id}-${key}-${fieldIndex}`}
                        {#if visibleFields[key]}
                            <tr>
                                <td>
                                    <label for={fieldId} class="form-label mb-0">
                                        {field.label}
                                        {#if field.required}<span class="text-danger">*</span>{/if}
                                    </label>
                                </td>
                                {#if isDatagrid}
                                    {#each section.tableColumns || [] as col}
                                        <td>
                                            {#if col.type === 'calculated'}
                                                {@const calcVal = getCalculatedValue(key, col.formula)}
                                                <input type="text" class="form-control bg-light" readonly value={calcVal} />
                                                <input type="hidden" name={`${key}-${col.key}`} value={calcVal} />
                                            {:else}
                                                <input
                                                    type={col.type === 'number' ? 'number' : 'text'}
                                                    class="form-control"
                                                    id={`${fieldId}-${col.key}`}
                                                    name={`${key}-${col.key}`}
                                                    bind:value={formData[key][col.key]}
                                                    on:input={() => clearError(key)}
                                                    disabled={readonly}
                                                />
                                            {/if}
                                        </td>
                                    {/each}
                                    {#if hasMerit}
                                        <td>
                                            {#if field.is_merit}
                                                <input
                                                    type="number"
                                                    class="form-control"
                                                    id="{fieldId}-max-score"
                                                    name="{key}-max-score"
                                                    placeholder="Max Score"
                                                    bind:value={formData[key].max_score}
                                                    on:input={() => clearError(key)}
                                                    disabled={readonly}
                                                />
                                            {/if}
                                        </td>
                                    {/if}
                                {:else}
                                    <td>
                                        {#if field.is_merit}
                                            <input
                                                type="number"
                                                class="form-control"
                                                id="{fieldId}-value"
                                                name="{key}-value"
                                                placeholder="Score"
                                                bind:value={formData[key].value}
                                                on:input={() => clearError(key)}
                                                disabled={readonly}
                                            />
                                        {:else}
                                            {@render fieldControl(field, fieldId, key, true)}
                                        {/if}
                                        {#if errors[key]}
                                            <div class="text-danger mt-1">{errors[key]}</div>
                                        {/if}
                                    </td>
                                    {#if hasMerit}
                                        <td>
                                            {#if field.is_merit}
                                                <input
                                                    type="number"
                                                    class="form-control"
                                                    id="{fieldId}-max-score"
                                                    name="{key}-max-score"
                                                    placeholder="Max Score"
                                                    bind:value={formData[key].max_score}
                                                    on:input={() => clearError(key)}
                                                    disabled={readonly}
                                                />
                                            {/if}
                                        </td>
                                    {/if}
                                {/if}
                            </tr>
                        {/if}
                    {/each}
                </tbody>
            </table>
        </div>
    {:else}
        <div class="row">
            {#each getFieldsForSection(section.id) as field, fieldIndex}
                {@const key = getKey(field)}
                {@const fieldId = `${section.id}-${key}-${fieldIndex}`}
                {#if visibleFields[key]}
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
{/snippet}

<div class="dynamic-form-container">
    {#if normalizedSchema.layout === 'tabs'}
        <ul class="nav nav-tabs mb-3">
            {#each normalizedSchema.sections as section}
                <li class="nav-item">
                    <button 
                        class="nav-link {activeTabId === section.id ? 'active' : ''}"
                        on:click={() => activeTabId = section.id}
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
                {#if visibleFields[key]}
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