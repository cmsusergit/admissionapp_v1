
<script lang="ts">
    import { enhance } from '$app/forms';
    import type { PageData, ActionData } from './$types';
    import SchemaTree from '$lib/components/SchemaTree.svelte';
    import ProfileTemplateHelp from '$lib/components/reports/ProfileTemplateHelp.svelte';
    import { onMount } from 'svelte';

    export let data: PageData;
    export let form: ActionData;

    let showHelpModal = false;
    let sideBySide = false;
    let textareaRef: HTMLTextAreaElement;

    function mapPathToVariable(path: string): string {
        // Translate technical join paths to Handlebars paths based on profile-data API structure
        
        // 1. Student Mapping
        if (path.includes('users!student_id')) {
            // Handle student_profiles nested under users
            if (path.includes('student_profiles!student_profiles_user_id_fkey')) {
                const parts = path.split('.');
                const lastPart = parts[parts.length - 1];
                return `student.${lastPart}`;
            }
            const parts = path.split('.');
            const lastPart = parts[parts.length - 1];
            return `student.${lastPart}`;
        }

        // 2. Course Mapping
        if (path.includes('courses!course_id')) {
            const parts = path.split('.');
            const lastPart = parts[parts.length - 1];
            return `course.${lastPart}`;
        }

        // 3. College Mapping (nested under courses)
        if (path.includes('colleges!college_id')) {
             // Handle universities nested under colleges
            if (path.includes('universities!university_id')) {
                const parts = path.split('.');
                const lastPart = parts[parts.length - 1];
                return `college.${lastPart}`;
            }
            const parts = path.split('.');
            const lastPart = parts[parts.length - 1];
            return `college.${lastPart}`;
        }

        // 4. Application/Admission Mapping
        if (path.includes('account_admissions!application_id')) {
            const parts = path.split('.');
            const lastPart = parts[parts.length - 1];
            return `application.${lastPart}`;
        }

        // 8. Payment Mapping
        if (path.includes('payments!application_id')) {
            return `application.receipt_number`;
        }

        // 7. Form Data Mapping (New)
        if (path.includes('form_data')) {
            const parts = path.split('.');
            const lastPart = parts[parts.length - 1];
            return `application.${lastPart}`;
        }

        // 5. Academic Year Mapping (nested under cycles)
        if (path.includes('academic_years!academic_year_id')) {
             return `application.academic_year`;
        }

        // 6. Marks Mapping
        if (path.includes('marks!application_id')) {
            const parts = path.split('.');
            const lastPart = parts[parts.length - 1];
            return `marks.[subject].${lastPart}`;
        }

        // Default: use the last part of the path if it's the base table (applications)
        const parts = path.split('.');
        const lastPart = parts[parts.length - 1];
        
        // If it's a root application field
        if (path === lastPart) {
            return `application.${lastPart}`;
        }

        return path; // Fallback
    }

    function handleInsertVariable(event: CustomEvent) {
        let { variable, path } = event.detail;
        
        // If it comes from SchemaTree, it will have 'path'. Map it.
        if (path) {
            variable = `{{${mapPathToVariable(path)}}}`;
        }

        if (!textareaRef) return;

        const start = textareaRef.selectionStart;
        const end = textareaRef.selectionEnd;
        const text = htmlContent;
        
        htmlContent = text.substring(0, start) + variable + text.substring(end);
        
        // Wait for Svelte to update the DOM then set cursor
        setTimeout(() => {
            textareaRef.focus();
            textareaRef.setSelectionRange(start + variable.length, start + variable.length);
        }, 0);
    }

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
        <!-- Sidebar: Configuration & Guide (col-md-3) -->
        <div class="col-md-3">
            <div class="card mb-3 shadow-sm border-0">
                <div class="card-header bg-dark text-white fw-bold">
                    <i class="bi bi-gear-fill me-2"></i> 1. Setup & Guide
                </div>
                <div class="card-body">
                    <div class="mb-3">
                        <label class="form-label fw-bold small">Base Table</label>
                        <select class="form-select form-select-sm" bind:value={selectedTable} disabled={!!editingId && reportType === 'tabular'}>
                            <option value="">Select Table</option>
                            {#each data.schema as table}
                                <option value={table.name}>{table.label}</option>
                            {/each}
                        </select>
                        {#if editingId && reportType === 'tabular'}
                            <div class="form-text x-small text-muted">Base table is locked for tabular reports.</div>
                        {/if}
                    </div>

                    {#if reportType === 'tabular'}
                        {#if selectedTable}
                            <hr>
                            <h6 class="small fw-bold mb-2">Schema Explorer</h6>
                            <div class="border rounded p-2 bg-light mb-3" style="max-height: 400px; overflow-y: auto;">
                                <SchemaTree 
                                    tableName={selectedTable} 
                                    schema={data.schema} 
                                    {selectedColumns}
                                    on:toggle={(e) => toggleColumn(e.detail.path, e.detail.label)}
                                />
                            </div>

                            <hr>
                            <h6 class="small fw-bold mb-2">User Parameters</h6>
                            <div class="bg-light p-2 rounded mb-3 border">
                                <div class="mb-2">
                                    <label class="x-small form-label fw-bold">Column</label>
                                    <select class="form-select form-select-sm" bind:value={newParam.column}>
                                        <option value="">Select Column...</option>
                                        {#each availableColumns as col}
                                            <option value={col.path}>{col.label}</option>
                                        {/each}
                                    </select>
                                </div>
                                <div class="row g-2 mb-2">
                                    <div class="col-6">
                                        <label class="x-small form-label fw-bold">Label</label>
                                        <input type="text" class="form-control form-control-sm" bind:value={newParam.label} placeholder="Label">
                                    </div>
                                    <div class="col-6">
                                        <label class="x-small form-label fw-bold">Type</label>
                                        <select class="form-select form-select-sm" bind:value={newParam.type}>
                                            <option value="text">Text</option>
                                            <option value="number">Number</option>
                                            <option value="date">Date</option>
                                            <option value="select">Dropdown</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="row g-2 mb-2">
                                    <div class="col-12">
                                        <label class="x-small form-label fw-bold">Operator</label>
                                        <select class="form-select form-select-sm" bind:value={newParam.operator}>
                                            <option value="eq">Equals (=)</option>
                                            <option value="ilike">Contains</option>
                                            <option value="match">Regex (match)</option>
                                            <option value="gt">Greater (&gt;)</option>
                                            <option value="lt">Less (&lt;)</option>
                                            <option value="gte">GTE (&ge;)</option>
                                            <option value="lte">LTE (&le;)</option>
                                            <option value="in">In List</option>
                                        </select>
                                    </div>
                                    {#if newParam.type === 'select'}
                                       <div class="col-12">
                                           <label class="x-small form-label fw-bold">Options (csv)</label>
                                           <div class="input-group input-group-sm">
                                               <textarea class="form-control" bind:value={newParam.options} placeholder="A,B,C" rows="3"></textarea>
                                               <form method="POST" action="?/suggest_options" use:enhance={() => {
                                                   suggesting = true;
                                                   return async ({ update }) => {
                                                       await update();
                                                       suggesting = false;
                                                   };
                                               }}>
                                                   <input type="hidden" name="table" value={selectedTable}>
                                                   <input type="hidden" name="column" value={newParam.column}>
                                                   <button class="btn btn-outline-secondary h-100" title="Auto-detect from DB" disabled={!newParam.column || suggesting}>
                                                       {#if suggesting}
                                                           <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                                       {:else}
                                                           <i class="bi bi-magic"></i>
                                                       {/if}
                                                   </button>
                                               </form>
                                           </div>
                                       </div>
                                    {/if}
                                </div>
                                <button class="btn btn-sm btn-primary w-100" on:click={addParameter} disabled={!newParam.column || !newParam.label}>Add Parameter</button>
                            </div>

                            {#if selectedParameters.length > 0}
                                <ul class="list-group list-group-flush border rounded overflow-hidden">
                                    {#each selectedParameters as p, idx}
                                        <li class="list-group-item d-flex justify-content-between align-items-center p-2 x-small">
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
                    {:else}
                        <!-- HTML Profile Dynamic Schema Picker in Sidebar -->
                        <div class="mt-2">
                            <h6 class="small fw-bold mb-2">Variable Picker</h6>
                            <p class="x-small text-muted mb-3">Explore tables and click <span class="badge bg-primary">+</span> to insert into editor.</p>
                            
                            {#if selectedTable}
                                <div class="border rounded p-2 bg-light mb-3" style="max-height: 600px; overflow-y: auto;">
                                    <SchemaTree 
                                        tableName={selectedTable} 
                                        schema={data.schema} 
                                        insertMode={true}
                                        on:insert={handleInsertVariable}
                                    />
                                </div>
                            {:else}
                                <div class="alert alert-warning x-small">Please select a <strong>Base Table</strong> (usually Applications) to start picking variables.</div>
                            {/if}
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        <!-- Main Content: Template Form (col-md-9) -->
        <div class="col-md-9">
            <div class="card mb-4 shadow-sm border-0">
                <div class="card-header d-flex justify-content-between align-items-center bg-white border-bottom-0 pt-3">
                    <h5 class="mb-0 fw-bold">{editingId ? 'Edit Template' : '2. Define Template'}</h5>
                    {#if editingId}
                        <button class="btn btn-sm btn-outline-secondary" on:click={cancelEdit}>Cancel Edit</button>
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
                            <div class="col-md-5 mb-3">
                                <label class="form-label fw-bold small">Template Name</label>
                                <input type="text" name="name" class="form-control" required bind:value={templateName} placeholder="e.g. ACPC Admission Form">
                            </div>
                            <div class="col-md-7 mb-3">
                                <label class="form-label fw-bold small">Allowed Roles</label>
                                <div class="d-flex flex-wrap gap-2">
                                    {#each [
                                        {v: 'adm_officer', l: 'Adm Officer'},
                                        {v: 'deo', l: 'DEO'},
                                        {v: 'fee_collector', l: 'Fee Collector'},
                                        {v: 'university_auth', l: 'Univ Auth'},
                                        {v: 'college_auth', l: 'College Auth'}
                                    ] as role}
                                        <div class="form-check form-check-inline m-0">
                                            <input class="form-check-input" type="checkbox" id="role_{role.v}" value={role.v} bind:group={allowedRoles}>
                                            <label class="form-check-label small" for="role_{role.v}">{role.l}</label>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        </div>

                        <div class="row border-top pt-3 mt-2">
                            <input type="hidden" name="report_type" value={reportType}>
                            
                            {#if reportType === 'html_profile'}
                                <div class="col-md-12 mb-3">
                                    <div class="row align-items-center">
                                        <div class="col-md-6">
                                            <label class="form-label fw-bold small">Target Form Type (Linkage)</label>
                                            <select class="form-select form-select-sm" name="target_form_type_id" bind:value={targetFormTypeId}>
                                                <option value="">-- Apply to All Form Types --</option>
                                                {#if data.formTypes}
                                                    {#each data.formTypes as ft}
                                                        <option value={ft.id}>{ft.name}</option>
                                                    {/each}
                                                {/if}
                                            </select>
                                        </div>
                                        <div class="col-md-6 text-end">
                                            <button type="button" class="btn btn-sm btn-info text-white" on:click={() => showHelpModal = true}>
                                                <i class="bi bi-fullscreen me-1"></i> Full Guide Modal
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-12 mb-3">
                                    <label class="form-label fw-bold small">HTML Content</label>
                                    <textarea 
                                        bind:this={textareaRef}
                                        class="form-control font-monospace" 
                                        name="html_content" 
                                        rows="25" 
                                        bind:value={htmlContent} 
                                        placeholder="&lt;div&gt;Hello &lbrace;&lbrace;student.full_name&rbrace;&rbrace;&lt;/div&gt;" 
                                        style="font-size: 0.85rem; background-color: #fcfcfc;"></textarea>
                                    <div class="form-text x-small">Click variables in the sidebar to insert. Use standard HTML/CSS.</div>
                                </div>
                            {/if}
                        </div>

                        <div class="d-flex justify-content-between align-items-center border-top pt-3">
                            <div class="text-muted small">
                                {#if reportType === 'tabular'}
                                    {selectedColumns.length} columns selected
                                {/if}
                            </div>
                            <div>
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
                        </div>
                    </form>
                </div>
            </div>

            <!-- Full Help Modal -->
            <ProfileTemplateHelp bind:showModal={showHelpModal} />
...

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
