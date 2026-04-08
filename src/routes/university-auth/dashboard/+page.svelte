<script lang="ts">
    import type { PageData } from './$types';

    export let data: PageData;

    // Client-side pagination for College Performance
    let currentCollegePage = 1;
    let pageSize = 20;
    $: totalPages = Math.ceil((data.collegeStats?.length || 0) / pageSize);
    $: paginatedColleges = data.collegeStats ? data.collegeStats.slice((currentCollegePage - 1) * pageSize, currentCollegePage * pageSize) : [];

    // Client-side pagination for Course Performance
    let currentCoursePage = 1;
    $: totalCoursePages = Math.ceil((data.courseStats?.length || 0) / pageSize);
    $: paginatedCourses = data.courseStats ? data.courseStats.slice((currentCoursePage - 1) * pageSize, currentCoursePage * pageSize) : [];
    
    // Calculate max value for scaling charts
    $: maxCourseVal = data.courseStats?.length ? Math.max(...data.courseStats.map(c => Math.max(c.capacity, c.admitted, 1))) : 100;

    // Client-side pagination for Branch Performance
    let currentBranchPage = 1;
    $: totalBranchPages = Math.ceil((data.branchStats?.length || 0) / pageSize);
    $: paginatedBranches = data.branchStats ? data.branchStats.slice((currentBranchPage - 1) * pageSize, currentBranchPage * pageSize) : [];
    
    // Calculate max value for scaling charts
    $: maxBranchVal = data.branchStats?.length ? Math.max(...data.branchStats.map(b => Math.max(b.capacity, b.admitted, 1))) : 100;
</script>

<div class="container-fluid">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="mb-0">University Dashboard</h1>
        <span class="text-muted">Overview</span>
    </div>

    {#if data.error}
        <div class="alert alert-danger">{data.error}</div>
    {:else}
        <!-- Overall Stats -->
        <div class="row g-4 mb-5">
            <div class="col-md-3">
                <div class="card shadow-sm border-primary h-100">
                    <div class="card-body text-center">
                        <h6 class="card-subtitle mb-2 text-muted">Total Applications</h6>
                        <h2 class="card-title text-primary display-4 fw-bold">{data.stats?.total || 0}</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card shadow-sm border-success h-100">
                    <div class="card-body text-center">
                        <h6 class="card-subtitle mb-2 text-muted">Total Admitted</h6>
                        <h2 class="card-title text-success display-4 fw-bold">{data.stats?.admitted || 0}</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card shadow-sm border-warning h-100">
                    <div class="card-body text-center">
                        <h6 class="card-subtitle mb-2 text-muted">Pending Processing</h6>
                        <h2 class="card-title text-warning display-4 fw-bold">{data.stats?.pending || 0}</h2>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card shadow-sm border-info h-100">
                    <div class="card-body text-center">
                        <h6 class="card-subtitle mb-2 text-muted">Affiliated Colleges</h6>
                        <h2 class="card-title text-info display-4 fw-bold">{data.stats?.collegesCount || 0}</h2>
                    </div>
                </div>
            </div>
        </div>

        <!-- College Performance Table -->
        <div class="card shadow-sm mb-5">
            <div class="card-header bg-white d-flex justify-content-between align-items-center py-3">
                <h5 class="mb-0"><i class="bi bi-building me-2"></i>College Performance</h5>
            </div>
            <div class="card-body p-0">
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="table-light">
                            <tr>
                                <th>College Name</th>
                                <th class="text-center">Total Apps</th>
                                <th class="text-center">Admitted</th>
                                <th class="text-center">Capacity</th>
                                <th class="text-center" style="width: 200px;">Fill Rate</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#if paginatedColleges.length > 0}
                                {#each paginatedColleges as college}
                                    <tr>
                                        <td class="fw-bold text-truncate" style="max-width: 250px;">{college.name}</td>
                                        <td class="text-center">{college.total}</td>
                                        <td class="text-center text-success fw-bold">{college.admitted}</td>
                                        <td class="text-center">{college.capacity}</td>
                                        <td class="text-center">
                                            <div class="d-flex align-items-center justify-content-center">
                                                <div class="progress flex-grow-1 me-2" style="height: 6px;">
                                                    <div class="progress-bar {college.capacity > 0 && (college.admitted/college.capacity) > 0.9 ? 'bg-success' : 'bg-primary'}"
                                                         role="progressbar"
                                                         style="width: {college.capacity > 0 ? (college.admitted / college.capacity) * 100 : 0}%">
                                                    </div>
                                                </div>
                                                <small class="text-muted" style="width: 35px;">{college.capacity > 0 ? Math.round((college.admitted / college.capacity) * 100) : 0}%</small>
                                            </div>
                                        </td>
                                    </tr>
                                {/each}
                            {:else}
                                <tr><td colspan="5" class="text-center py-4 text-muted">No colleges found.</td></tr>
                            {/if}
                        </tbody>
                    </table>
                </div>
            </div>
            {#if totalPages > 1}
                <div class="card-footer d-flex justify-content-center">
                    <button class="btn btn-sm btn-secondary me-2" disabled={currentCollegePage <= 1} on:click={() => currentCollegePage--}>Prev</button>
                    <span class="align-self-center">Page {currentCollegePage} of {totalPages}</span>
                    <button class="btn btn-sm btn-secondary ms-2" disabled={currentPage >= totalPages} on:click={() => currentPage++}>Next</button>
                </div>
            {/if}
        </div>

        <div class="row g-4">
            <!-- Course Performance Charts -->
            <div class="col-lg-6">
                <div class="card shadow-sm h-100">
                    <div class="card-header bg-white py-3">
                        <h5 class="mb-0"><i class="bi bi-book me-2"></i>Course Intake vs Admitted</h5>
                    </div>
                    <div class="card-body p-4">
                        {#if paginatedCourses.length > 0}
                            {#each paginatedCourses as course}
                                <div class="mb-4">
                                    <div class="d-flex justify-content-between mb-1">
                                        <span class="fw-bold text-truncate" style="max-width: 70%;" title={course.name}>{course.name}</span>
                                        <small class="text-muted">
                                            <span class="text-success fw-bold">{course.admitted}</span> / {course.capacity}
                                        </small>
                                    </div>
                                    <!-- Comparison Bars -->
                                    <div class="position-relative" style="height: 24px;">
                                        <!-- Background (Capacity) Bar -->
                                        <div class="position-absolute start-0 top-0 h-100 bg-light rounded" 
                                             style="width: {(course.capacity / maxCourseVal) * 100}%; z-index: 1;"
                                             title="Capacity: {course.capacity}">
                                        </div>
                                        <!-- Foreground (Admitted) Bar -->
                                        <div class="position-absolute start-0 top-0 h-100 bg-success bg-opacity-75 rounded" 
                                             style="width: {(course.admitted / maxCourseVal) * 100}%; z-index: 2;"
                                             title="Admitted: {course.admitted}">
                                        </div>
                                    </div>
                                    <div class="d-flex justify-content-between mt-1" style="font-size: 0.75rem;">
                                        <span class="text-muted">0</span>
                                        <span class="text-muted">{maxCourseVal}</span>
                                    </div>
                                </div>
                            {/each}
                        {:else}
                            <div class="text-center py-5 text-muted">No course data available.</div>
                        {/if}
                    </div>
                    {#if totalCoursePages > 1}
                        <div class="card-footer d-flex justify-content-center py-2">
                            <button class="btn btn-sm btn-outline-secondary me-2" disabled={currentCoursePage <= 1} on:click={() => currentCoursePage--}>Prev</button>
                            <span class="align-self-center small text-muted">Page {currentCoursePage} of {totalCoursePages}</span>
                            <button class="btn btn-sm btn-outline-secondary ms-2" disabled={currentCoursePage >= totalCoursePages} on:click={() => currentCoursePage++}>Next</button>
                        </div>
                    {/if}
                </div>
            </div>

            <!-- Branch Performance Charts -->
            <div class="col-lg-6">
                <div class="card shadow-sm h-100">
                    <div class="card-header bg-white py-3">
                        <h5 class="mb-0"><i class="bi bi-diagram-3 me-2"></i>Branch Intake vs Admitted</h5>
                    </div>
                    <div class="card-body p-4">
                        {#if paginatedBranches.length > 0}
                            {#each paginatedBranches as branch}
                                <div class="mb-4">
                                    <div class="d-flex justify-content-between mb-1">
                                        <div>
                                            <span class="fw-bold text-truncate d-block" style="max-width: 250px;" title={branch.name}>{branch.name}</span>
                                            <small class="text-muted d-block" style="font-size: 0.75rem;">{branch.courseName}</small>
                                        </div>
                                        <div class="text-end">
                                            <span class="text-success fw-bold">{branch.admitted}</span> <small class="text-muted">/ {branch.capacity}</small>
                                        </div>
                                    </div>
                                    <!-- Comparison Bars -->
                                    <div class="position-relative" style="height: 24px;">
                                        <!-- Capacity Bar -->
                                        <div class="position-absolute start-0 top-0 h-100 bg-light rounded" 
                                             style="width: {(branch.capacity / maxBranchVal) * 100}%; z-index: 1;"
                                             title="Capacity: {branch.capacity}">
                                        </div>
                                        <!-- Admitted Bar -->
                                        <div class="position-absolute start-0 top-0 h-100 bg-success bg-opacity-75 rounded" 
                                             style="width: {(branch.admitted / maxBranchVal) * 100}%; z-index: 2;"
                                             title="Admitted: {branch.admitted}">
                                        </div>
                                    </div>
                                     <div class="d-flex justify-content-between mt-1" style="font-size: 0.75rem;">
                                        <span class="text-muted">0</span>
                                        <span class="text-muted">{maxBranchVal}</span>
                                    </div>
                                </div>
                            {/each}
                        {:else}
                            <div class="text-center py-5 text-muted">No branch data available.</div>
                        {/if}
                    </div>
                    {#if totalBranchPages > 1}
                        <div class="card-footer d-flex justify-content-center py-2">
                            <button class="btn btn-sm btn-outline-secondary me-2" disabled={currentBranchPage <= 1} on:click={() => currentBranchPage--}>Prev</button>
                            <span class="align-self-center small text-muted">Page {currentBranchPage} of {totalBranchPages}</span>
                            <button class="btn btn-sm btn-outline-secondary ms-2" disabled={currentBranchPage >= totalBranchPages} on:click={() => currentBranchPage++}>Next</button>
                        </div>
                    {/if}
                </div>
            </div>
        </div>
    {/if}
</div>
