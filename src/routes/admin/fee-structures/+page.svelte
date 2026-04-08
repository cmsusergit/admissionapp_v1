<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import FeeStructureBuilder from '$lib/components/FeeStructureBuilder.svelte';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';

    export let data: PageData;

    let showAddModal = false;
    let showEditModal = false;
    let showDeleteModal = false;
    let showCopyModal = false;

    let targetCopyValues = {
        source_id: '',
        target_course_id: '',
        target_academic_year_id: '',
        target_form_type: 'Provisional'
    };

    let currentFeeStructure = writable({
        id: '',
        course_id: '',
        academic_year_id: '',
        form_type: 'Provisional',
        total_fee: 0,
        installment_json: '[]',
        fee_components: [] as any[], // Array of sections
        courses: { name: '' },
        academic_years: { name: '' }
    });

    let newFeeComponents: any[] = [];
    let newTotalFee = 0;

    function openEditModal(feeStructure: any) {
        currentFeeStructure.set({
            ...feeStructure,
            installment_json: typeof feeStructure.installment_json === 'string' 
                ? feeStructure.installment_json 
                : JSON.stringify(feeStructure.installment_json, null, 2),
            fee_components: feeStructure.fee_components || []
        });
        showEditModal = true;
    }

    function openDeleteModal(feeStructure: any) {
        currentFeeStructure.set(feeStructure);
        showDeleteModal = true;
    }

    function openCopyModal(feeStructure: any) {
        currentFeeStructure.set(feeStructure);
        targetCopyValues = {
            source_id: feeStructure.id,
            target_course_id: feeStructure.course_id, // Default to same course
            target_academic_year_id: feeStructure.academic_year_id, // Default to same year
            target_form_type: feeStructure.form_type // Default to same type
        };
        showCopyModal = true;
    }

    function handleTotalChange(e: CustomEvent) {
        // Update the total fee when components change
        if (showAddModal) {
            newTotalFee = e.detail;
        } else if (showEditModal) {
            $currentFeeStructure.total_fee = e.detail;
        }
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Fee Structure Management</h1>

    <button class="btn btn-primary mb-3" on:click={() => {
        newFeeComponents = [];
        newTotalFee = 0;
        showAddModal = true;
    }}>Add New Fee Structure</button>

    {#if data.feeStructures.length > 0}
        <div class="table-responsive">
            <table class="table table-striped table-hover">
                <thead>
                    <tr>
                        <th>Course</th>
                        <th>Academic Year</th>
                        <th>Form Type</th>
                        <th>Total Fee</th>
                        <th>Components</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {#each data.feeStructures as fs}
                        <tr>
                            <td>{fs.courses?.name || 'N/A'}</td>
                            <td>{fs.academic_years?.name || 'N/A'}</td>
                            <td><span class="badge bg-secondary">{fs.form_type || 'Provisional'}</span></td>
                            <td>{fs.total_fee}</td>
                            <td>
                                <small>
                                    {#if fs.fee_components && fs.fee_components.length > 0}
                                        {fs.fee_components.length} Sections
                                    {:else}
                                        -
                                    {/if}
                                </small>
                            </td>
                            <td>
                                <button class="btn btn-sm btn-info me-2" on:click={() => openEditModal(fs)}>Edit</button>
                                <button class="btn btn-sm btn-secondary me-2" on:click={() => openCopyModal(fs)}>Copy</button>
                                <button class="btn btn-sm btn-danger" on:click={() => openDeleteModal(fs)}>Delete</button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {:else}
        <p>No fee structures found. Add one!</p>
    {/if}
</div>

<!-- Add Fee Structure Modal -->
<div class="modal" tabindex="-1" style="display: {showAddModal ? 'block' : 'none'};">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Add New Fee Structure</h5>
                <button type="button" class="btn-close" on:click={() => (showAddModal = false)}></button>
            </div>
            <form method="POST" action="?/create" use:enhance={() => { 
                showAddModal = false; 
                startLoading(); 
                return async ({update}) => {
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label for="add-course-id" class="form-label">Course</label>
                            <select class="form-select" id="add-course-id" name="course_id" required>
                                <option value="">Select Course</option>
                                {#each data.courses as course}
                                    <option value={course.id}>{course.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="add-academic-year-id" class="form-label">Academic Year</label>
                            <select class="form-select" id="add-academic-year-id" name="academic_year_id" required>
                                <option value="">Select Academic Year</option>
                                {#each data.academicYears as year}
                                    <option value={year.id}>{year.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="add-form-type" class="form-label">Form Type</label>
                            <select class="form-select" id="add-form-type" name="form_type" required>
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

                    <div class="mb-3">
                        <label class="form-label">Fee Components Breakdown</label>
                        <div class="border p-2 rounded bg-light">
                            <FeeStructureBuilder 
                                bind:value={newFeeComponents} 
                                on:totalChange={handleTotalChange} 
                            />
                        </div>
                        <input type="hidden" name="fee_components" value={JSON.stringify(newFeeComponents)} />
                    </div>

                    <div class="mb-3">
                        <label for="add-total-fee" class="form-label">Total Fee (Calculated)</label>
                        <input type="number" step="0.01" class="form-control" id="add-total-fee" name="total_fee" value={newTotalFee} readonly />
                    </div>
                    
                    <div class="mb-3">
                        <label for="add-installment-json" class="form-label">Installment Details (JSON)</label>
                        <textarea class="form-control" id="add-installment-json" name="installment_json" rows="3" value="[]"></textarea>
                        <div class="form-text">e.g., `[&#123; "amount": {newTotalFee}, "due_date": "2026-06-15" &#125;]`.</div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showAddModal = false)}>Close</button>
                    <button type="submit" class="btn btn-primary">Create Fee Structure</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Edit Fee Structure Modal -->
<div class="modal" tabindex="-1" style="display: {showEditModal ? 'block' : 'none'};">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit Fee Structure</h5>
                <button type="button" class="btn-close" on:click={() => (showEditModal = false)}></button>
            </div>
            <form method="POST" action="?/update" use:enhance={() => { 
                showEditModal = false; 
                startLoading(); 
                return async ({update}) => {
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentFeeStructure.id} />
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label for="edit-course-id" class="form-label">Course</label>
                            <select class="form-select" id="edit-course-id" name="course_id" bind:value={$currentFeeStructure.course_id} required>
                                <option value="">Select Course</option>
                                {#each data.courses as course}
                                    <option value={course.id}>{course.name}</option>
                                {/each}
                            </select>
                        </div>
                        <div class="col-md-6 mb-3">
                            <label for="edit-academic-year-id" class="form-label">Academic Year</label>
                            <select class="form-select" id="edit-academic-year-id" name="academic_year_id" bind:value={$currentFeeStructure.academic_year_id} required>
                                <option value="">Select Academic Year</option>
                                {#each data.academicYears as year}
                                    <option value={year.id}>{year.name}</option>
                                {/each}
                            </select>
                        </div>
                         <div class="col-md-6 mb-3">
                            <label for="edit-form-type" class="form-label">Form Type</label>
                            <select class="form-select" id="edit-form-type" name="form_type" bind:value={$currentFeeStructure.form_type} required>
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

                    <div class="mb-3">
                        <label class="form-label">Fee Components Breakdown</label>
                         <div class="border p-2 rounded bg-light">
                            <FeeStructureBuilder 
                                bind:value={$currentFeeStructure.fee_components} 
                                on:totalChange={handleTotalChange} 
                            />
                        </div>
                        <input type="hidden" name="fee_components" value={JSON.stringify($currentFeeStructure.fee_components)} />
                    </div>

                    <div class="mb-3">
                        <label for="edit-total-fee" class="form-label">Total Fee (Calculated)</label>
                        <input type="number" step="0.01" class="form-control" id="edit-total-fee" name="total_fee" bind:value={$currentFeeStructure.total_fee} readonly />
                    </div>

                    <div class="mb-3">
                        <label for="edit-installment-json" class="form-label">Installment Details (JSON)</label>
                        <textarea class="form-control" id="edit-installment-json" name="installment_json" rows="3" bind:value={$currentFeeStructure.installment_json}></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showEditModal = false)}>Close</button>
                    <button type="submit" class="btn btn-primary">Save Changes</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Delete Fee Structure Modal -->

<!-- Delete Fee Structure Modal -->
<div class="modal" tabindex="-1" style="display: {showDeleteModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete Fee Structure</h5>
                <button type="button" class="btn-close" on:click={() => (showDeleteModal = false)}></button>
            </div>
            <form method="POST" action="?/delete" use:enhance={() => { 
                showDeleteModal = false; 
                startLoading(); 
                return async ({update}) => {
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentFeeStructure.id} />
                    <p>Are you sure you want to delete this fee structure?</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showDeleteModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-danger">Delete</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Copy Fee Structure Modal -->
<div class="modal" tabindex="-1" style="display: {showCopyModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Copy Fee Structure</h5>
                <button type="button" class="btn-close" on:click={() => (showCopyModal = false)}></button>
            </div>
            <form method="POST" action="?/copy" use:enhance={() => { 
                showCopyModal = false; 
                startLoading(); 
                return async ({update}) => {
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="source_id" value={targetCopyValues.source_id} />
                    
                    <div class="alert alert-info">
                        <strong>Source:</strong><br>
                        Course: {$currentFeeStructure.courses?.name}<br>
                        Year: {$currentFeeStructure.academic_years?.name}<br>
                        Type: <span class="badge bg-secondary">{$currentFeeStructure.form_type}</span><br>
                        Total: {$currentFeeStructure.total_fee}
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
                        <label for="copy-academic-year-id" class="form-label">Target Academic Year</label>
                        <select class="form-select" id="copy-academic-year-id" name="target_academic_year_id" bind:value={targetCopyValues.target_academic_year_id} required>
                            <option value="">Select Academic Year</option>
                            {#each data.academicYears as year}
                                <option value={year.id}>{year.name}</option>
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

<style lang="scss">
    .modal {
        background-color: rgba(0, 0, 0, 0.5);
    }
</style>
