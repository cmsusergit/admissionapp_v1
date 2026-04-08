<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import { toastStore } from '$lib/stores/toastStore';

    export let data: PageData;
    export let form: ActionData;

    $: if (form?.message) {
        if (form.success) {
            toastStore.success(form.message);
        } else {
            toastStore.error(form.message);
        }
    }

    let showDeleteModal = false;
    let showCopyModal = false;

    let targetCopyValues = {
        source_id: '',
        target_course_id: '',
        target_cycle_id: '',
        target_form_type: 'Provisional'
    };

    let currentAdmissionForm = writable({
        id: '',
        course_id: '',
        cycle_id: '',
        form_type: 'Provisional',
        form_fee: 0,
        schema_json: '',
        is_enabled: true,
        courses: { name: '' },
        admission_cycles: { name: '' }
    });

    function openDeleteModal(form: any) {
        currentAdmissionForm.set({ ...form }); 
        showDeleteModal = true;
    }

    function openCopyModal(form: any) {
         currentAdmissionForm.set({ ...form });
        
        targetCopyValues = {
            source_id: form.id,
            target_course_id: form.course_id,
            target_cycle_id: form.cycle_id,
            target_form_type: form.form_type
        };
        showCopyModal = true;
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Manage Admission Forms</h1>

    <a href="/admin/forms/new" class="btn btn-primary mb-3">Add New Admission Form</a>

    <div class="card">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th>Course</th>
                            <th>Admission Cycle</th>
                            <th>Type</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.admissionForms as form}
                            <tr>
                                <td>{form.courses?.name}</td>
                                <td>{form.admission_cycles?.name} ({form.admission_cycles?.academic_years?.name})</td>
                                <td>
                                    <span class="badge bg-secondary">{form.form_type}</span>
                                    {#if form.is_enabled === false}
                                        <span class="badge bg-warning text-dark ms-1">Disabled</span>
                                    {/if}
                                </td>
                                <td>
                                    <a href="/admin/forms/{form.id}/edit" class="btn btn-sm btn-info me-2">Edit</a>
                                    <button class="btn btn-sm btn-secondary me-2" on:click={() => openCopyModal(form)}>Copy</button>
                                    <button class="btn btn-sm btn-danger" on:click={() => openDeleteModal(form)}>Delete</button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<!-- Delete Modal -->
<div class="modal" tabindex="-1" style="display: {showDeleteModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete Admission Form</h5>
                <button type="button" class="btn-close" on:click={() => (showDeleteModal = false)}></button>
            </div>
            <form method="POST" action="?/delete" use:enhance={() => { 
                return async ({ result, update }) => { 
                    await update(); 
                    if (result.type === 'success') showDeleteModal = false; 
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentAdmissionForm.id} />
                    <p>Are you sure you want to delete the form for <strong>{$currentAdmissionForm.courses?.name}</strong>?</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showDeleteModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-danger">Delete</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Copy Modal -->
<div class="modal" tabindex="-1" style="display: {showCopyModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Copy Admission Form</h5>
                <button type="button" class="btn-close" on:click={() => (showCopyModal = false)}></button>
            </div>
            <form method="POST" action="?/copy" use:enhance={() => { 
                return async ({ result, update }) => { 
                    await update(); 
                    if (result.type === 'success') showCopyModal = false; 
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="source_id" value={targetCopyValues.source_id} />

                    <div class="alert alert-info">
                        <strong>Source Configuration:</strong><br>
                        Course: {$currentAdmissionForm.courses?.name}<br>
                        Cycle: {$currentAdmissionForm.admission_cycles?.name}<br>
                        Type: <span class="badge bg-secondary">{$currentAdmissionForm.form_type}</span><br>
                        Fee: ₹{$currentAdmissionForm.form_fee}
                    </div>
                    
                    <h6 class="mb-3">Target Configuration</h6>

                    <div class="mb-3">
                        <label for="copy-course-id" class="form-label">Target Course</label>
                        <select class="form-select" id="copy-course-id" name="target_course_id" bind:value={targetCopyValues.target_course_id} required>
                            <option value="">Select Course</option>
                            {#each data.courses as course}
                                <option value={course.id}>{course.name}</option>
                            {/each}
                        </select>
                    </div>

                    <div class="mb-3">
                        <label for="copy-cycle-id" class="form-label">Target Admission Cycle</label>
                        <select class="form-select" id="copy-cycle-id" name="target_cycle_id" bind:value={targetCopyValues.target_cycle_id} required>
                            <option value="">Select Cycle</option>
                            {#each data.admissionCycles as cycle}
                                {@const c = cycle as any}
                                <option value={cycle.id}>{cycle.name} ({c.academic_years?.name || 'N/A'})</option>
                            {/each}
                        </select>
                    </div>

                    <div class="mb-3">
                        <label for="copy-form-type" class="form-label">Target Form Type</label>
                        <select class="form-select" id="copy-form-type" name="target_form_type" bind:value={targetCopyValues.target_form_type} required>
                            {#if data.formTypes}
                                {#each data.formTypes as ft}
                                    <option value={ft.name}>{ft.name}</option>
                                {/each}
                            {:else}
                                <option value="Provisional">Provisional</option>
                            {/if}
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showCopyModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-primary">Copy & Create</button>
                </div>
            </form>
        </div>
    </div>
</div>

<style>
    .modal {
        background-color: rgba(0, 0, 0, 0.5);
    }
</style>