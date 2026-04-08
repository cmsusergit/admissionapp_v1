<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let data: PageData;
    export let form: ActionData;

    // Filter State
    let filterCourseId = data.filters?.courseId || '';
    let filterCycleId = data.filters?.cycleId || '';
    let filterFormType = data.filters?.formType || '';
    let filterSearch = data.filters?.search || '';

    // Extract unique options for Recalculate Ranks form (or use filters if set)
    // We default to the filter values if set, otherwise empty
    let selectedCourseId = filterCourseId;
    let selectedCycleId = filterCycleId;
    let selectedFormType = filterFormType;

    function applyFilters() {
        const query = new URLSearchParams($page.url.searchParams.toString());
        
        if (filterCourseId) query.set('courseId', filterCourseId);
        else query.delete('courseId');

        if (filterCycleId) query.set('cycleId', filterCycleId);
        else query.delete('cycleId');

        if (filterFormType) query.set('formType', filterFormType);
        else query.delete('formType');

        if (filterSearch) query.set('search', filterSearch);
        else query.delete('search');

        goto(`?${query.toString()}`);
    }

    function clearFilters() {
        filterCourseId = '';
        filterCycleId = '';
        filterFormType = '';
        filterSearch = '';
        goto('?');
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Admin: Merit Management</h1>

    {#if form?.message}
        <div class="alert {form.error ? 'alert-danger' : 'alert-success'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <!-- Filters Section -->
    <div class="card mb-4">
        <div class="card-header">
            <h5 class="mb-0"><i class="bi bi-funnel me-2"></i>Filter Applications</h5>
        </div>
        <div class="card-body">
            <div class="row g-3 align-items-end">
                <div class="col-md-3">
                    <label class="form-label">Course</label>
                    <select class="form-select" bind:value={filterCourseId}>
                        <option value="">All Courses</option>
                        {#each data.courses as course}
                            <option value={course.id}>{course.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Admission Cycle</label>
                    <select class="form-select" bind:value={filterCycleId}>
                        <option value="">All Cycles</option>
                        {#each data.cycles as cycle}
                            <option value={cycle.id}>{cycle.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label">Form Type</label>
                    <select class="form-select" bind:value={filterFormType}>
                        <option value="">All Types</option>
                        <option value="Provisional">Provisional</option>
                        <option value="ACPC">ACPC</option>
                        <option value="MQ/NRI">MQ/NRI</option>
                        <option value="Vacant">Vacant</option>
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label">Search</label>
                    <input type="text" class="form-control" placeholder="Name or Email" bind:value={filterSearch}>
                </div>
                <div class="col-md-2">
                    <div class="d-flex gap-2">
                        <button class="btn btn-primary flex-grow-1" on:click={applyFilters}>Apply</button>
                        <button class="btn btn-outline-secondary" on:click={clearFilters}>Clear</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Recalculate Ranks Section -->
    <div class="card mb-4 border-warning">
        <div class="card-header bg-warning text-dark">
            <h5 class="mb-0"><i class="bi bi-list-ol me-2"></i>Recalculate Ranks</h5>
        </div>
        <div class="card-body">
            <p class="small text-muted">Use this after manually updating merit scores to re-assign ranks (1, 2, 3...) based on the new scores.</p>
            <form method="POST" action="?/recalculateRanks" use:enhance class="row g-3 align-items-end">
                <div class="col-md-3">
                    <label class="form-label">Course</label>
                    <select class="form-select" name="course_id" bind:value={selectedCourseId} required>
                        <option value="">Select Course</option>
                        {#each data.courses as course}
                            <option value={course.id}>{course.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Admission Cycle</label>
                    <select class="form-select" name="cycle_id" bind:value={selectedCycleId} required>
                        <option value="">Select Cycle</option>
                        {#each data.cycles as cycle}
                            <option value={cycle.id}>{cycle.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Form Type</label>
                    <select class="form-select" name="form_type" bind:value={selectedFormType}>
                        <option value="">Select Type (Default: Provisional)</option>
                        <option value="Provisional">Provisional</option>
                        <option value="ACPC">ACPC</option>
                        <option value="MQ/NRI">MQ/NRI</option>
                        <option value="Vacant">Vacant</option>
                    </select>
                </div>
                <div class="col-md-3">
                    <button type="submit" class="btn btn-dark w-100">
                        <i class="bi bi-arrow-repeat me-2"></i> Recalculate
                    </button>
                </div>
            </form>
        </div>
    </div>

    <div class="card mb-4">
        <div class="card-header d-flex justify-content-between align-items-center">
            <span>Applications with Generated Merit List Entries</span>
            <span class="badge bg-secondary">{data.applications.length} Found</span>
        </div>
        <div class="card-body">
            {#if data.applications.length > 0}
                <div class="table-responsive">
                    <table class="table table-striped table-hover align-middle">
                        <thead>
                            <tr>
                                <th>Student</th>
                                <th>Course</th>
                                <th>Cycle</th>
                                <th>Status</th>
                                <th>Current Rank</th>
                                <th style="width: 250px;">Merit Score (Manual)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.applications as app}
                                {@const appAny = app as any}
                                <tr>
                                    <td>
                                        {appAny.users?.full_name || 'N/A'}<br/>
                                        <small class="text-muted">{appAny.users?.email}</small>
                                    </td>
                                    <td>{appAny.courses?.name} ({appAny.courses?.colleges?.name})</td>
                                    <td>{appAny.admission_cycles?.name}</td>
                                    <td><span class="badge bg-info">{appAny.status}</span></td>
                                    <td>
                                        {#if appAny.merit_rank}
                                            <span class="badge bg-primary rounded-pill">#{appAny.merit_rank}</span>
                                        {:else}
                                            <span class="text-muted">-</span>
                                        {/if}
                                    </td>
                                    <td>
                                        <form method="POST" action="?/updateMeritScore" use:enhance class="d-flex gap-2">
                                            <input type="hidden" name="application_id" value={appAny.id} />
                                            <input 
                                                type="number" 
                                                step="0.01" 
                                                class="form-control form-control-sm" 
                                                name="merit_score" 
                                                value={appAny.merit_score || 0} 
                                                style="width: 100px;"
                                            />
                                            <button type="submit" class="btn btn-sm btn-outline-success">Update</button>
                                        </form>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}
                <p>No applications found with generated merit entries. Use the Admission Officer "Merit List" page to generate the initial list first.</p>
            {/if}
        </div>
    </div>
</div>