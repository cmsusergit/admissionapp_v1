<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';

    export let data: PageData;
    export let form: ActionData;

    let selectedCourseId = '';
    // Default to the first active cycle if available
    let selectedCycleId = data.cycles.length > 0 ? data.cycles[0].id : '';
    let selectedFormType = ''; // Default empty to force selection? Or first available.

    // Derived filtered list of applications based on selection
    $: filteredApplications = data.applications.filter(app => {
        return (!selectedCourseId || app.course_id === selectedCourseId) &&
               (!selectedCycleId || app.cycle_id === selectedCycleId) &&
               (!selectedFormType || app.form_type === selectedFormType);
    });

    // Pagination
    let currentPage = 1;
    let pageSize = 20;
    
    $: totalPages = Math.ceil(filteredApplications.length / pageSize);
    $: paginatedApplications = filteredApplications.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // Reset page on filter change
    $: if (filteredApplications) currentPage = 1;

    $: canCalculate = selectedCourseId && selectedCycleId && selectedFormType;

    // Determine publication status
    // Refactored to match strict form_type check now that we are dynamic
    $: isPublished = data.admissionForms?.find(f => 
        f.course_id === selectedCourseId && 
        f.cycle_id === selectedCycleId && 
        f.form_type === selectedFormType
    )?.is_merit_published || false;
</script>

<div class="container-fluid">
    <h1 class="mb-4">Admission Officer: Merit List Management</h1>

    {#if form?.message}
        <div class="alert {form.success ? 'alert-success' : 'alert-danger'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <div class="card mb-4">
        <div class="card-header">Merit Generation Configuration</div>
        <div class="card-body">
            <div class="row g-3 align-items-end">
                <div class="col-md-4">
                    <label for="cycle-select" class="form-label">Admission Cycle</label>
                    <select class="form-select" id="cycle-select" bind:value={selectedCycleId}>
                        <option value="">Select Cycle</option>
                        {#each data.cycles as cycle}
                            <option value={cycle.id}>{cycle.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-4">
                    <label for="course-select" class="form-label">Course</label>
                    <select class="form-select" id="course-select" bind:value={selectedCourseId}>
                        <option value="">Select Course</option>
                        {#each data.courses as course}
                            <option value={course.id}>{course.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-2">
                    <label for="type-select" class="form-label">Form Type</label>
                    <select class="form-select" id="type-select" bind:value={selectedFormType}>
                        <option value="">Select Type</option>
                        {#if data.formTypes}
                            {#each data.formTypes as ft}
                                <option value={ft.name}>{ft.name}</option>
                            {/each}
                        {/if}
                    </select>
                </div>
                <div class="col-md-2">
                    <form method="POST" action="?/generateMerit" use:enhance={() => {
                        startLoading();
                        return async ({ update }) => { await update(); stopLoading(); }
                    }}>
                        <input type="hidden" name="course_id" value={selectedCourseId}>
                        <input type="hidden" name="cycle_id" value={selectedCycleId}>
                        <input type="hidden" name="form_type" value={selectedFormType}>
                        <button type="submit" class="btn btn-primary w-100" disabled={!canCalculate}>
                            <i class="bi bi-calculator"></i> Generate List
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <!-- Results Table -->
    <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center gap-3">
                <span>Merit List Preview ({filteredApplications.length})</span>
                {#if isPublished}
                    <span class="badge bg-success">Published</span>
                {:else if filteredApplications.length > 0 && filteredApplications[0].merit_rank}
                    <span class="badge bg-warning text-dark">Draft Generated</span>
                {:else}
                    <span class="badge bg-secondary">Not Generated</span>
                {/if}
            </div>
            
            <div class="d-flex gap-2">
                {#if isPublished}
                    <form method="POST" action="?/unpublishMerit" use:enhance={() => {
                        if(!confirm('Unpublishing will hide ranks from students. Continue?')) return cancel();
                        startLoading();
                        return async ({ update }) => { await update(); stopLoading(); }
                    }}>
                        <input type="hidden" name="course_id" value={selectedCourseId}>
                        <input type="hidden" name="cycle_id" value={selectedCycleId}>
                        <input type="hidden" name="form_type" value={selectedFormType}>
                        <button class="btn btn-danger btn-sm">
                            <i class="bi bi-eye-slash"></i> Unpublish
                        </button>
                    </form>
                {:else if filteredApplications.length > 0 && filteredApplications[0].merit_rank}
                    <form method="POST" action="?/publishMerit" use:enhance={() => {
                        if(!confirm('Publishing will make these ranks visible to students. Continue?')) return cancel();
                        startLoading();
                        return async ({ update }) => { await update(); stopLoading(); }
                    }}>
                        <input type="hidden" name="course_id" value={selectedCourseId}>
                        <input type="hidden" name="cycle_id" value={selectedCycleId}>
                        <input type="hidden" name="form_type" value={selectedFormType}>
                        <button class="btn btn-success btn-sm">
                            <i class="bi bi-check-circle"></i> Publish List
                        </button>
                    </form>
                {/if}
            </div>
        </div>
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Score</th>
                            <th>Student</th>
                            <th>Status</th>
                            <th>App ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#if paginatedApplications.length > 0}
                            {#each paginatedApplications as app}
                                <tr>
                                    <td>
                                        {#if app.merit_rank}
                                            <span class="badge bg-primary rounded-pill">{app.merit_rank}</span>
                                        {:else}
                                            <span class="text-muted">-</span>
                                        {/if}
                                    </td>
                                    <td>{app.merit_score ? app.merit_score.toFixed(2) : '-'}</td>
                                    <td>
                                        {app.student_user?.full_name || 'N/A'} <br>
                                        <small class="text-muted">{app.student_user?.email}</small>
                                    </td>
                                    <td><span class="badge bg-secondary">{app.status}</span></td>
                                    <td><small>{app.id.slice(0,8)}...</small></td>
                                </tr>
                            {/each}
                        {:else}
                            <tr>
                                <td colspan="5" class="text-center py-4">
                                    {#if canCalculate}
                                        No applications found for this selection.
                                    {:else}
                                        Please select options to view or generate list.
                                    {/if}
                                </td>
                            </tr>
                        {/if}
                    </tbody>
                </table>
            </div>
            {#if totalPages > 1}
                <div class="card-footer d-flex justify-content-center">
                    <button class="btn btn-sm btn-secondary me-2" disabled={currentPage <= 1} on:click={() => currentPage--}>Prev</button>
                    <span class="align-self-center">Page {currentPage} of {totalPages}</span>
                    <button class="btn btn-sm btn-secondary ms-2" disabled={currentPage >= totalPages} on:click={() => currentPage++}>Next</button>
                </div>
            {/if}
        </div>
    </div>
</div>
