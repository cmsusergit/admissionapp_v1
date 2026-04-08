
<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData, ActionData } from './$types';
    import SchemaTree from '$lib/components/SchemaTree.svelte';
    import ProfileTemplateHelp from '$lib/components/reports/ProfileTemplateHelp.svelte';
    import { onMount } from 'svelte';

    export let data: PageData;
    export let form: ActionData;

    let showHelpModal = false;

    // Load bootstrap JS dynamically for interactive components like the Accordion in the Help Modal
    onMount(async () => {
        if (typeof window !== 'undefined' && !(window as any).bootstrap) {
            import('bootstrap');
        }
    });

    let selectedTable = '';
    let selectedColumns: any[] = [];
    let templateName = '';
    let templateDesc = '';
    let allowedRoles = ['adm_officer']; // Default
    
    // New variables for HTML Profile Reports
    let reportType = 'tabular'; // 'tabular' or 'html_profile'
    let targetFormTypeId = '';
    let htmlContent = '';

    let previewData: any[] = [];
    let previewColumns: string[] = [];
    let generatedQuery = '';
    let loading = false;
    let editingId: string | null = null;
    let suggesting = false;

    // Parameters State
    let selectedParameters: any[] = [];
    let newParam = { label: '', column: '', type: 'text', operator: 'eq', options: '' };

    // Helper to find table definition
    $: tableDef = (name: string) => data.schema.find(t => t.name === name);
    
    // Use selectedColumns directly for parameter dropdown to support deep nesting
    $: availableColumns = selectedColumns.map(c => ({ path: c.path, label: c.label }));

    function addParameter() {
        if (!newParam.label || !newParam.column) return;
        
        const paramToAdd = { ...newParam, name: newParam.column + '_' + Date.now() };
        if (paramToAdd.type === 'select' && typeof paramToAdd.options === 'string') {
             // @ts-ignore
             paramToAdd.options = paramToAdd.options.split(',').map(s => s.trim()).filter(s => s);
        }

        selectedParameters = [...selectedParameters, paramToAdd];
        newParam = { label: '', column: '', type: 'text', operator: 'eq', options: '' }; // Reset
    }

    function removeParameter(idx: number) {
        selectedParameters.splice(idx, 1);
        selectedParameters = [...selectedParameters];
    }

    function toggleColumn(path: string, label: string) {
        const idx = selectedColumns.findIndex(c => c.path === path);
        if (idx >= 0) {
            selectedColumns.splice(idx, 1);
            selectedColumns = [...selectedColumns];
        } else {
            selectedColumns = [...selectedColumns, { path, label }];
        }
    }

    function editTemplate(template: any) {
        editingId = template.id;
        templateName = template.name;
        // templateDesc = template.description; // TODO: Add desc field to form if needed, currently missing in UI
        selectedTable = template.base_table;
        allowedRoles = template.allowed_roles;
        reportType = template.report_type || 'tabular';
        targetFormTypeId = template.target_form_type_id || '';
        htmlContent = template.html_content || '';
        
        // Parse config
        // Assuming config structure matches what we expect
        if (template.configuration) {
            selectedColumns = template.configuration.columns || [];
            selectedParameters = template.configuration.parameters || [];
        }
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function cancelEdit() {
        editingId = null;
        templateName = '';
        selectedTable = '';
        allowedRoles = ['adm_officer'];
        reportType = 'tabular';
        targetFormTypeId = '';
        htmlContent = '';
        selectedColumns = [];
        selectedParameters = [];
        previewData = [];
        generatedQuery = '';
    }

    async function suggestOptions() {
        if (!selectedTable || !newParam.column) return;
        suggesting = true;
        
        const formData = new FormData();
        formData.append('table', selectedTable);
        formData.append('column', newParam.column);
        
        // Use fetch directly for simplicity since it's an API-like call within page logic
        // Or trigger a form submission. Fetch is cleaner here for partial update.
        // But we need to hit the server action endpoint.
        // Actually, let's use a hidden form submit? No, easier to just use standard fetch to an API endpoint or invoke action.
        // In SvelteKit, easiest way to invoke action without navigation is use:enhance on a form button.
        // Let's create a hidden button for this or just simulate.
        
        // We will just do a fetch to a dedicated API endpoint? 
        // No, let's stick to actions.
        // We can submit to ?/suggest_options
        
        const response = await fetch('?/suggest_options', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
             // SvelteKit returns serialized result. We need to deserialize if it's complex.
             // Usually it returns { type: 'success', data: ... }
             // Wait, action response is wrapped.
             // Let's parse the text response manually if needed.
             // Actually, `deserialize` from `$app/forms` is needed.
             // Let's try simpler approach: just assume text for now or simple JSON.
             // The server returns JSON object { type: 'data', data: { success: true, suggestions: ... } }
             
             // Quick fix: Let's just create a button that uses enhance and updates the newParam.options
             // See below in HTML structure.
        }
        suggesting = false;
    }

    $: if (form?.success) {
        if (form.suggestions) {
            newParam.options = form.suggestions;
        } else if (!form.previewData) {
            // Save success
            if (editingId) {
                // Keep editing mode or reset? Usually reset after save.
                cancelEdit();
            } else {
                // Clear form
                templateName = '';
                selectedColumns = [];
                selectedParameters = [];
            }
        }
    }
    
    $: if (form?.success && form.previewData) {
        previewData = form.previewData;
        previewColumns = form.previewColumns;
        generatedQuery = form.queryString || '';
    }
</script>

<div class="container-fluid">
    <h1>Report Builder</h1>

    <div class="row">
        <div class="col-md-12 mb-4">
            <div class="card border-primary">
                <div class="card-header bg-primary text-white">
                    <strong>Template Type Selection</strong>
                </div>
                <div class="card-body">
                    <div class="row align-items-center">
                        <div class="col-md-4">
                            <label class="form-label fw-bold mb-0">Select what kind of template you want to build:</label>
                        </div>
                        <div class="col-md-6">
                            <select class="form-select border-primary" bind:value={reportType} disabled={!!editingId}>
                                <option value="tabular">Standard Tabular (CSV Export / Table View)</option>
                                <option value="html_profile">Custom Profile Form (HTML Print Layout)</option>
                            </select>
                        </div>
                    </div>
                    {#if editingId}
                        <div class="form-text text-warning mt-2">Report type cannot be changed while editing an existing template.</div>
                    {/if}
                </div>
            </div>
        </div>
    </div>
    
    <div class="row">
        <div class="col-md-4">
            {#if reportType === 'tabular'}
            <div class="card mb-3">
                <div class="card-header">1. Configuration</div>
                <div class="card-body">
                    <div class="mb-3">
                        <label class="form-label">Base Table</label>
                        <select class="form-select" bind:value={selectedTable} disabled={!!editingId}>
                            <option value="">Select Table</option>
                            {#each data.schema as table}
                                <option value={table.name}>{table.label}</option>
                            {/each}
                        </select>
                        {#if editingId}
                            <div class="form-text text-muted">Base table cannot be changed while editing.</div>
                        {/if}
                    </div>
                    
                    {#if selectedTable}
                        <hr>
                        <h6>Schema Explorer</h6>
                        <div class="border rounded p-2 bg-light mb-3" style="max-height: 300px; overflow-y: auto;">
                            <SchemaTree 
                                tableName={selectedTable} 
                                schema={data.schema} 
                                {selectedColumns}
                                on:toggle={(e) => toggleColumn(e.detail.path, e.detail.label)}
                            />
                        </div>

                        <hr>
                        <h6>User Parameters</h6>
                        {#if form?.message && !form.previewData && !form.success}
                             <div class="alert alert-danger alert-sm p-1 small mb-2">{form.message}</div>
                        {/if}
                        <div class="bg-light p-2 rounded mb-3">
                            <div class="mb-2">
                                <label class="small form-label">Column</label>
                                <select class="form-select form-select-sm" bind:value={newParam.column}>
                                    <option value="">Select Column...</option>
                                    {#each availableColumns as col}
                                        <option value={col.path}>{col.label}</option>
                                    {/each}
                                </select>
                            </div>
                            <div class="row g-2 mb-2">
                                <div class="col-6">
                                    <label class="small form-label">Label</label>
                                    <input type="text" class="form-control form-control-sm" bind:value={newParam.label} placeholder="e.g. Status">
                                </div>
                                <div class="col-6">
                                    <label class="small form-label">Type</label>
                                    <select class="form-select form-select-sm" bind:value={newParam.type}>
                                        <option value="text">Text</option>
                                        <option value="number">Number</option>
                                        <option value="date">Date</option>
                                        <option value="select">Dropdown</option>
                                    </select>
                                </div>
                            </div>
                            <div class="row g-2 mb-2">
                                <div class="col-6">
                                    <label class="small form-label">Operator</label>
                                    <select class="form-select form-select-sm" bind:value={newParam.operator}>
                                        <option value="eq">Equals (=)</option>
                                        <option value="ilike">Contains</option>
                                        <option value="gt">Greater (&gt;)</option>
                                        <option value="lt">Less (&lt;)</option>
                                        <option value="gte">GTE (&ge;)</option>
                                        <option value="lte">LTE (&le;)</option>
                                        <option value="in">In List</option>
                                    </select>
                                </div>
                                <div class="col-6">
                                    {#if newParam.type === 'select'}
                                        <label class="small form-label">Options (csv)</label>
                                        <div class="input-group input-group-sm">
                                            <input type="text" class="form-control" bind:value={newParam.options} placeholder="A,B,C">
                                            <form method="POST" action="?/suggest_options" use:enhance={() => {
                                                suggesting = true;
                                                return async ({ update }) => {
                                                    await update();
                                                    suggesting = false;
                                                };
                                            }}>
                                                <input type="hidden" name="table" value={selectedTable}>
                                                <input type="hidden" name="column" value={newParam.column}>
                                                <button class="btn btn-outline-secondary" title="Auto-detect from DB" disabled={!newParam.column || suggesting}>
                                                    {#if suggesting}
                                                        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                                    {:else}
                                                        <i class="bi bi-magic"></i>
                                                    {/if}
                                                </button>
                                            </form>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                            <button class="btn btn-sm btn-primary w-100" on:click={addParameter} disabled={!newParam.column || !newParam.label}>Add Parameter</button>
                        </div>

                        {#if selectedParameters.length > 0}
                            <ul class="list-group list-group-flush small">
                                {#each selectedParameters as p, idx}
                                    <li class="list-group-item d-flex justify-content-between align-items-center px-0">
                                        <div>
                                            <strong>{p.label}</strong> <span class="text-muted">({p.column})</span>
                                            <br>
                                            <span class="badge bg-secondary">{p.operator}</span>
                                        </div>
                                        <button class="btn btn-xs btn-outline-danger border-0" on:click={() => removeParameter(idx)}>&times;</button>
                                    </li>
                                {/each}
                            </ul>
                        {/if}
                    {/if}
                </div>
            </div>
            {/if}
        </div>

        <div class="col-md-8">
            <div class="card mb-4">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <span>2. {editingId ? 'Edit Template' : 'Save Template'}</span>
                    {#if editingId}
                        <button class="btn btn-sm btn-secondary" on:click={cancelEdit}>Cancel Edit</button>
                    {/if}
                </div>
                <div class="card-body">
                    {#if form?.message}
                        <div class="alert alert-danger">{form.message}</div>
                    {/if}
                    {#if form?.success && !form.previewData && !form.suggestions}
                        <div class="alert alert-success">Template {editingId ? 'updated' : 'saved'} successfully!</div>
                    {/if}

                    <form method="POST" action="?/save" use:enhance={() => {
                        loading = true;
                        return async ({ update }) => {
                            await update();
                            loading = false;
                        };
                    }}>
                        {#if editingId}
                            <input type="hidden" name="id" value={editingId}>
                        {/if}
                        <input type="hidden" name="base_table" value={selectedTable}>
                        <input type="hidden" name="configuration" value={JSON.stringify({ columns: selectedColumns, parameters: selectedParameters })}>
                        <input type="hidden" name="allowed_roles" value={JSON.stringify(allowedRoles)}>
                        
                        <div class="row">
                            <div class="col-md-6 mb-3">
                                <label class="form-label">Name</label>
                                <input type="text" name="name" class="form-control" required bind:value={templateName}>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label">Roles</label>
                                <select multiple class="form-select" bind:value={allowedRoles}>
                                    <option value="adm_officer">Adm Officer</option>
                                    <option value="deo">DEO</option>
                                    <option value="fee_collector">Fee Collector</option>
                                </select>
                            </div>
                        </div>

                        <div class="row border-top pt-3 mt-2">
                            <!-- Hidden input to ensure report_type is submitted with form -->
                            <input type="hidden" name="report_type" value={reportType}>
                            
                            {#if reportType === 'html_profile'}
                                <div class="col-md-8 mb-3">
                                    <label class="form-label">Target Form Type (Optional)</label>
                                    <select class="form-select" name="target_form_type_id" bind:value={targetFormTypeId}>
                                        <option value="">-- All Form Types --</option>
                                        <!-- Assuming data.formTypes is available from the load function -->
                                        {#if data.formTypes}
                                            {#each data.formTypes as ft}
                                                <option value={ft.id}>{ft.name}</option>
                                            {/each}
                                        {/if}
                                    </select>
                                    <small class="text-muted">Link this template to a specific form type.</small>
                                </div>
                                <div class="col-12 mb-3">
                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                        <label class="form-label mb-0">HTML Template</label>
                                        <button type="button" class="btn btn-sm btn-outline-info" on:click={() => showHelpModal = true}>
                                            <i class="bi bi-info-circle"></i> View Variables Guide
                                        </button>
                                    </div>
                                    <textarea class="form-control font-monospace" name="html_content" rows="15" bind:value={htmlContent} placeholder="HTML layout..." style="font-size: 0.85rem;"></textarea>
                                    <small class="text-muted">Use Handlebars style variables e.g., <code>&lbrace;&lbrace;student.full_name&rbrace;&rbrace;</code>, <code>&lbrace;&lbrace;application.form_data.acpc_number&rbrace;&rbrace;</code>.</small>
                                </div>
                            {/if}
                        </div>

                        <div class="mt-3">
                            <button class="btn btn-success" disabled={(reportType === 'tabular' && (!selectedTable || selectedColumns.length === 0)) || (reportType === 'html_profile' && !htmlContent) || allowedRoles.length === 0 || loading}>
                                {#if loading}
                                    <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                    Saving...
                                {:else}
                                    {editingId ? 'Update Template' : 'Save Template'}
                                {/if}
                            </button>
                            {#if reportType === 'tabular'}
                                <button class="btn btn-info ms-2 text-white" formaction="?/preview" formnovalidate disabled={!selectedTable || selectedColumns.length === 0 || loading}>
                                    {#if loading}
                                        <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                        Loading...
                                    {:else}
                                        Preview
                                    {/if}
                                </button>
                            {/if}
                        </div>
                    </form>
                </div>
            </div>

            <!-- Profile Template Help Modal -->
            <ProfileTemplateHelp bind:showModal={showHelpModal} />

            {#if previewData.length > 0}
                <div class="card mb-4 border-info">
                    <div class="card-header bg-info text-white">Preview Results (Top 5)</div>
                    <div class="card-body p-0">
                        <div class="table-responsive">
                            <table class="table table-sm table-striped mb-0">
                                <thead>
                                    <tr>
                                        {#each previewColumns as col}
                                            <th>{col}</th>
                                        {/each}
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each previewData as row}
                                        <tr>
                                            {#each previewColumns as col}
                                                <td>{row[col]}</td>
                                            {/each}
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            {/if}

            {#if generatedQuery}
                <div class="alert alert-secondary mb-4 font-monospace" style="font-size: 0.85rem; white-space: pre-wrap;">
                    <strong>Generated Query:</strong> {generatedQuery}
                </div>
            {/if}

            <div class="card">
                <div class="card-header">Existing Templates</div>
                <div class="card-body p-0">
                    <table class="table table-striped mb-0">
                        <thead><tr><th>Name</th><th>Base</th><th>Roles</th><th>Action</th></tr></thead>
                        <tbody>
                            {#each data.templates as t}
                                <tr>
                                    <td>{t.name}</td>
                                    <td>{t.base_table}</td>
                                    <td>{t.allowed_roles.join(', ')}</td>
                                    <td>
                                        <div class="btn-group btn-group-sm">
                                            <button class="btn btn-primary" on:click={() => editTemplate(t)}>Edit</button>
                                            <form method="POST" action="?/delete" on:submit={(e) => !confirm('Are you sure you want to delete this template?') && e.preventDefault()}>
                                                <input type="hidden" name="id" value={t.id}>
                                                <button class="btn btn-danger rounded-0 rounded-end">Delete</button>
                                            </form>
                                        </div>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>
</div>
