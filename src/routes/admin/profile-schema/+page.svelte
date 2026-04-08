<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { invalidateAll } from '$app/navigation';
    import { toastStore } from '$lib/stores/toastStore';

    export let data: PageData;

    let isSubmitting = false;
    let editingId: string | null = null;
    let newField = {
        key: '',
        label: '',
        type: 'text',
        is_required: false,
        options: ''
    };

    function resetForm() {
        editingId = null;
        newField = { key: '', label: '', type: 'text', is_required: false, options: '' };
    }

    function editField(field: any) {
        editingId = field.id;
        newField = {
            key: field.key,
            label: field.label,
            type: field.type,
            is_required: field.is_required,
            options: field.options ? field.options.join('\n') : ''
        };
    }
</script>

<div class="container-fluid mt-4">
    <h1 class="mb-4">Student Profile Schema</h1>
    <p class="text-muted">Define the common fields that will be part of every Student's Master Profile.</p>

    <div class="row">
        <!-- Form -->
        <div class="col-md-4">
            <div class="card shadow-sm mb-4">
                <div class="card-header {editingId ? 'bg-warning text-dark' : 'bg-primary text-white'}">
                    {editingId ? 'Edit Field' : 'Add New Field'}
                </div>
                <div class="card-body">
                    <form method="POST" action={editingId ? "?/update" : "?/create"} use:enhance={() => {
                        isSubmitting = true;
                        return async ({ result }) => {
                            isSubmitting = false;
                            if (result.type === 'success') {
                                toastStore.success(editingId ? 'Field updated' : 'Field added');
                                resetForm();
                                await invalidateAll();
                            } else {
                                toastStore.error(result.data?.message || 'Error');
                            }
                        };
                    }}>
                        {#if editingId}
                            <input type="hidden" name="id" value={editingId} />
                        {/if}
                        <div class="mb-3">
                            <label class="form-label">Field Label</label>
                            <input type="text" name="label" class="form-control" bind:value={newField.label} required placeholder="e.g. Date of Birth">
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Key (Internal)</label>
                            <input type="text" name="key" class="form-control" bind:value={newField.key} required placeholder="e.g. dob (lowercase)" readonly={!!editingId}>
                            <div class="form-text">Unique identifier. Cannot be changed after creation.</div>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Input Type</label>
                            <select name="type" class="form-select" bind:value={newField.type}>
                                <option value="text">Text</option>
                                <option value="number">Number</option>
                                <option value="date">Date</option>
                                <option value="email">Email</option>
                                <option value="textarea">Text Area</option>
                                <option value="select">Dropdown (Select)</option>
                                <option value="checkbox">Checkbox</option>
                                <option value="file">File (Document/Photo)</option>
                            </select>
                        </div>
                        
                        {#if newField.type === 'select'}
                            <div class="mb-3">
                                <label class="form-label">Options (One per line)</label>
                                <textarea name="options" class="form-control" rows="4" bind:value={newField.options} placeholder="Value|Label (e.g., IN|India)&#10;US|United States"></textarea>
                                <div class="form-text">Format: <code>value|Label</code> or just <code>Label</code></div>
                            </div>
                        {/if}

                        <div class="form-check mb-3">
                            <input class="form-check-input" type="checkbox" name="is_required" id="req" bind:checked={newField.is_required}>
                            <label class="form-check-label" for="req">Required Field</label>
                        </div>

                        <div class="d-flex gap-2">
                            <button class="btn btn-primary w-100" disabled={isSubmitting}>
                                {editingId ? 'Update Field' : 'Add Field'}
                            </button>
                            {#if editingId}
                                <button type="button" class="btn btn-outline-secondary w-100" on:click={resetForm} disabled={isSubmitting}>
                                    Cancel
                                </button>
                            {/if}
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <!-- List -->
        <div class="col-md-8">
            <div class="card shadow-sm">
                <div class="card-header">Current Schema Fields</div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0">
                            <thead class="bg-light">
                                <tr>
                                    <th>Label</th>
                                    <th>Key</th>
                                    <th>Type</th>
                                    <th>Required</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each data.fields as field}
                                    <tr>
                                        <td>{field.label}</td>
                                        <td><code>{field.key}</code></td>
                                        <td><span class="badge bg-secondary">{field.type}</span></td>
                                        <td>{field.is_required ? 'Yes' : 'No'}</td>
                                        <td>
                                            <div class="d-flex gap-2">
                                                <button class="btn btn-sm btn-outline-primary" title="Edit" on:click={() => editField(field)}>
                                                    <i class="bi bi-pencil"></i>
                                                </button>
                                                <form method="POST" action="?/delete" use:enhance={() => {
                                                    return async ({ result }) => {
                                                        if (result.type === 'success') {
                                                            toastStore.success('Field deleted');
                                                            if (editingId === field.id) resetForm();
                                                            await invalidateAll();
                                                        } else {
                                                            toastStore.error('Failed to delete field');
                                                        }
                                                    };
                                                }}>
                                                    <input type="hidden" name="id" value={field.id}>
                                                    <button class="btn btn-sm btn-outline-danger" title="Delete" on:click={(e) => !confirm('Delete this field?') && e.preventDefault()}>
                                                        <i class="bi bi-trash"></i>
                                                    </button>
                                                </form>
                                            </div>
                                        </td>
                                    </tr>
                                {:else}
                                    <tr><td colspan="5" class="text-center py-4">No fields defined yet.</td></tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
