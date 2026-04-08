<script lang="ts">
    import { fade } from 'svelte/transition';
    import { onMount } from 'svelte';
    import { browser } from '$app/environment';
    import { PUBLIC_SUPABASE_URL } from '$env/static/public';

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

    interface FormSection {
        id: string;
        title: string;
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
    
    // State for Select Options (dynamic loading)
    let dynamicOptions: Record<string, { value: string; label: string }[]> = {};
    
    // Compute field key helper
    const getKey = (f: FormField) => f.key || f.name || '';

    // Initialize visibility and dynamic options
    let visibleFields: Record<string, boolean> = {};

    // Reactivity for initializing formData for merit fields
    $: {
        normalizedSchema.fields.forEach(field => {
            const key = getKey(field);
            if (field.is_merit) {
                // If it's a merit field and not already an object, convert it
                if (typeof formData[key] !== 'object' || formData[key] === null || !('value' in formData[key])) {
                    const existingValue = formData[key]; // Might be undefined or a primitive value
                    formData = {
                        ...formData,
                        [key]: {
                            value: existingValue !== undefined ? existingValue : undefined,
                            max_score: field.max_score !== undefined ? field.max_score : 100
                        }
                    };
                }
            }
        });
    }

    // Normalize Schema
    $: normalizedSchema = {
        layout: schema.layout || 'list',
        sections: (schema.sections && schema.sections.length > 0) 
            ? schema.sections 
            : [{ id: 'default', title: 'General' }],
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
</script>

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
                    <div class="row">
                        {#each getFieldsForSection(section.id) as field (getKey(field))}
                            {@const key = getKey(field)}
                            {#if visibleFields[key]}
                                <div class="{`col-md-${field.col || 12}`} mb-3">
                                    <label for={key} class="form-label">
                                        {field.label}
                                        {#if field.required}<span class="text-danger">*</span>{/if}
                                    </label>

                                    {#if field.is_merit}
                                        <div class="row g-2">
                                            <div class="col-md-6">
                                                <input
                                                    type="number"
                                                    class="form-control"
                                                    id="{key}-value"
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
                                                    id="{key}-max-score"
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
                                            id={key}
                                            name={key}
                                            bind:value={formData[key]}
                                            on:input={() => clearError(key)}
                                        />
                                    {:else if field.type === 'textarea'}
                                        <textarea
                                            class="form-control"
                                            id={key}
                                            name={key}
                                            bind:value={formData[key]}
                                            on:input={() => clearError(key)}
                                            disabled={readonly}
                                        ></textarea>
                                    {:else if field.type === 'select'}
                                        <select
                                            class="form-select"
                                            id={key}
                                            name={key}
                                            bind:value={formData[key]}
                                            on:change={() => clearError(key)}
                                            disabled={readonly || loadingOptions[key] || (field.dependsOn && !formData[field.dependsOn])}
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
                                                id={key}
                                                name={key}
                                                bind:checked={formData[key]}
                                                on:change={() => clearError(key)}
                                                disabled={readonly}
                                            />
                                            <label class="form-check-label" for={key}>{field.label}</label>
                                        </div>
                                    {:else if field.type === 'file'}
                                        <div class="input-group">
                                            <input
                                                type="file"
                                                class="form-control"
                                                id={key}
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

                                    {#if errors[key]}
                                        <div class="text-danger mt-1">{errors[key]}</div>
                                    {/if}
                                </div>
                            {/if}
                            <!-- FIELD RENDER LOGIC END -->
                        {/each}
                    </div>
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
                    <div class="row">
                        {#each getFieldsForSection(section.id) as field (getKey(field))}
                            <!-- FIELD RENDER LOGIC START (Duplicated) -->
                            {@const key = getKey(field)}
                            {#if visibleFields[key]}
                                <div class="{`col-md-${field.col || 12}`} mb-3">
                                    <label for={key} class="form-label">
                                        {field.label}
                                        {#if field.required}<span class="text-danger">*</span>{/if}
                                    </label>
                                    
                                    {#if field.is_merit}
                                        <div class="row g-2">
                                            <div class="col-md-6">
                                                <input
                                                    type="number"
                                                    class="form-control"
                                                    id="{key}-value"
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
                                                    id="{key}-max-score"
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
                                            id={key}
                                            name={key}
                                            bind:value={formData[key]}
                                            on:input={() => clearError(key)}
                                        />
                                    {:else if field.type === 'textarea'}
                                        <textarea
                                            class="form-control"
                                            id={key}
                                            name={key}
                                            bind:value={formData[key]}
                                            on:input={() => clearError(key)}
                                            disabled={readonly}
                                        ></textarea>
                                    {:else if field.type === 'select'}
                                        <select
                                            class="form-select"
                                            id={key}
                                            name={key}
                                            bind:value={formData[key]}
                                            on:change={() => clearError(key)}
                                            disabled={readonly || loadingOptions[key] || (field.dependsOn && !formData[field.dependsOn])}
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
                                                id={key}
                                                name={key}
                                                bind:checked={formData[key]}
                                                on:change={() => clearError(key)}
                                                disabled={readonly}
                                            />
                                            <label class="form-check-label" for={key}>{field.label}</label>
                                        </div>
                                    {:else if field.type === 'file'}
                                        <div class="input-group">
                                            <input
                                                type="file"
                                                class="form-control"
                                                id={key}
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

                                    {#if errors[key]}
                                        <div class="text-danger mt-1">{errors[key]}</div>
                                    {/if}
                                </div>
                            {/if}
                            <!-- FIELD RENDER LOGIC END -->
                        {/each}
                    </div>
                </div>
            </div>
        {/each}

    {:else}
        <!-- List Layout (Legacy) -->
        <div class="row">
            {#each schema.fields as field (getKey(field))}
                <!-- FIELD RENDER LOGIC START (Duplicated) -->
                                            {@const key = getKey(field)}
                                {#if visibleFields[key]}
                                    <div class="{`col-md-${field.col || 12}`} mb-3">
                                        <label for={key} class="form-label">
                                            {field.label}
                                            {#if field.required}<span class="text-danger">*</span>{/if}
                                        </label>
                                        
                                        {#if field.is_merit}
                                            <div class="row g-2">
                                                <div class="col-md-6">
                                                    <input
                                                        type="number"
                                                        class="form-control"
                                                        id="{key}-value"
                                                        name="{key}-value"
                                                        placeholder="Score"
                                                        bind:value={formData[key].value}
                                                        on:input={() => clearError(key)}
                                                    />
                                                </div>
                                                <div class="col-md-6">
                                                    <input
                                                        type="number"
                                                        class="form-control"
                                                        id="{key}-max-score"
                                                        name="{key}-max-score"
                                                        placeholder="Max Score"
                                                        bind:value={formData[key].max_score}
                                                        on:input={() => clearError(key)}
                                                    />
                                                </div>
                                            </div>
                                        {:else if field.type === 'text' || field.type === 'email' || field.type === 'number' || field.type === 'date'}
                                            <input
                                                type={field.type}
                                                class="form-control"
                                                id={key}
                                                name={key}
                                                bind:value={formData[key]}
                                                on:input={() => clearError(key)}
                                            />                        {:else if field.type === 'textarea'}
                            <textarea
                                class="form-control"
                                id={key}
                                name={key}
                                bind:value={formData[key]}
                                on:input={() => clearError(key)}
                            ></textarea>
                        {:else if field.type === 'select'}
                            <select
                                class="form-select"
                                id={key}
                                name={key}
                                bind:value={formData[key]}
                                on:change={() => clearError(key)}
                                disabled={loadingOptions[key] || (field.dependsOn && !formData[field.dependsOn])}
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
                                    id={key}
                                    name={key}
                                    bind:checked={formData[key]}
                                    on:change={() => clearError(key)}
                                />
                                <label class="form-check-label" for={key}>{field.label}</label>
                            </div>
                        {:else if field.type === 'file'}
                            <div class="input-group">
                                <input
                                    type="file"
                                    class="form-control"
                                    id={key}
                                    name={key}
                                    accept="image/*,application/pdf"
                                    on:change={(e) => handleFileUpload(e, key)}
                                    disabled={uploadingFields[key]}
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
                                        View Document
                                    </a>
                                </div>
                            {:else if uploadingFields[key]}
                                <div class="mt-1">
                                    <small class="text-info">Uploading...</small>
                                </div>
                            {/if}
                        {:else}
                            <p class="text-danger">Unsupported field type: {field.type}</p>
                        {/if}

                        {#if errors[key]}
                            <div class="text-danger mt-1">{errors[key]}</div>
                        {/if}
                    </div>
                {/if}
                <!-- FIELD RENDER LOGIC END -->
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
