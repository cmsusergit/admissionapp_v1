<script lang="ts">
    import type { PageData } from './$types';
    import * as XLSX from 'xlsx';

    export let data: PageData;

    function calculateVacancy(capacity: number, admissions: number): number {
        return Math.max(0, capacity - admissions);
    }

    function branchTotal(branches: any[], field: 'capacity' | 'approved' | 'admissions'): number {
        return (branches || []).reduce((sum, branch) => sum + (branch?.[field] || 0), 0);
    }

    async function downloadCapacityReport() {
        if (!data.capacityData || data.capacityData.length === 0) {
            alert('No capacity data available to export.');
            return;
        }

        const workbook = XLSX.utils.book_new();

        data.capacityData.forEach((collegeGroup: any) => {
            collegeGroup.courses.forEach((course: any) => {
                if (course.branches && course.branches.length > 0) {
                    const sheetData = course.branches.map((branch: any) => {
                        const row: any = {
                            'College': collegeGroup.collegeName,
                            'Branch Name': branch.name,
                            'Intake Capacity': branch.capacity,
                            'Unique Students': branch.uniqueCount,
                            'Common Applicants': branch.commonCount,
                        };

                        // Add dynamic form type columns
                        collegeGroup.uniqueFormTypes.forEach((fType: string) => {
                            const stats = branch.formTypes[fType];
                            row[`${fType} (Total/Appr)`] = stats ? `${stats.total} / ${stats.approved}` : '0 / 0';
                        });

                        row['Total Approved'] = branch.approved;
                        row['Admissions Done'] = branch.admissions;
                        row['Vacancy'] = calculateVacancy(branch.capacity, branch.admissions);

                        return row;
                    });

                    const worksheet = XLSX.utils.json_to_sheet(sheetData);
                    const sheetName = `${course.courseName.substring(0, 20)}_${collegeGroup.collegeName.substring(0, 10)}`.replace(/[\\/?*\[\]]/g, '');
                    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
                }
            });
        });

        if (workbook.SheetNames.length === 0) {
            alert('No branch data found to export.');
            return;
        }

        XLSX.writeFile(workbook, 'Admissions_Capacity_Report.xlsx');
    }
</script>

<div class="container-fluid mt-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="mb-1">Capacity Report</h1>
            <p class="text-muted mb-0">Detailed intake capacity, unique student counts, and form-wise application breakdowns.</p>
        </div>
        <button class="btn btn-success" on:click={downloadCapacityReport}>
            <i class="bi bi-file-earmark-excel"></i> Export to Excel
        </button>
    </div>

    {#if data.capacityData && data.capacityData.length > 0}
        {#each data.capacityData as collegeGroup (collegeGroup.collegeName)}
            <div class="college-group mb-5">
                <div class="d-flex align-items-center mb-3">
                    <h3 class="mb-0 text-dark border-bottom border-primary border-3 pb-1">{collegeGroup.collegeName}</h3>
                    <span class="badge bg-secondary ms-3">{collegeGroup.courses.length} Courses</span>
                </div>
                
                <div class="row g-4">
                    {#each collegeGroup.courses as course (course.courseName)}
                        <div class="col-12">
                            <div class="card shadow-sm">
                                <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                                    <h5 class="mb-0">{course.courseName}</h5>
                                    <span class="badge bg-light text-primary fs-6">
                                        Total Intake: {branchTotal(course.branches, 'capacity')}
                                    </span>
                                </div>
                                <div class="card-body p-0">
                                    <div class="table-responsive">
                                        <table class="table table-bordered table-striped table-hover mb-0" style="font-size: 0.85rem;">
                                            <thead class="table-light align-middle text-center">
                                                <tr>
                                                    <th rowspan="2" class="text-start">Branch</th>
                                                    <th rowspan="2">Intake Capacity</th>
                                                    <th colspan="2" class="bg-info bg-opacity-10">Applicant Metrics</th>
                                                    {#if collegeGroup.uniqueFormTypes.length > 0}
                                                        <th colspan={collegeGroup.uniqueFormTypes.length} class="bg-success bg-opacity-10">Form-wise Applications (Total / Approved)</th>
                                                    {/if}
                                                    <th rowspan="2">Total Approved</th>
                                                    <th rowspan="2">Admissions Done</th>
                                                    <th rowspan="2">Vacancy</th>
                                                </tr>
                                                <tr>
                                                    <th class="bg-info bg-opacity-10 small">Unique Students</th>
                                                    <th class="bg-info bg-opacity-10 small">Common Appls</th>
                                                    {#each collegeGroup.uniqueFormTypes as fType}
                                                        <th class="bg-success bg-opacity-10 small">{fType}</th>
                                                    {/each}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {#each course.branches as branch (branch.id)}
                                                    <tr class="text-center">
                                                        <td class="fw-bold text-start">{branch.name}</td>
                                                        <td>{branch.capacity}</td>
                                                        <td class="table-info bg-opacity-10">{branch.uniqueCount}</td>
                                                        <td class="table-info bg-opacity-10">
                                                            {#if branch.commonCount > 0}
                                                                <span class="badge bg-primary rounded-pill">{branch.commonCount}</span>
                                                            {:else}
                                                                <span class="text-muted">-</span>
                                                            {/if}
                                                        </td>
                                                        
                                                        {#each collegeGroup.uniqueFormTypes as fType}
                                                            <td class="table-success bg-opacity-10">
                                                                {#if branch.formTypes[fType]}
                                                                    <div class="d-flex flex-column">
                                                                        <span class="fw-bold">{branch.formTypes[fType].total}</span>
                                                                        <span class="text-success x-small">(Appr: {branch.formTypes[fType].approved})</span>
                                                                    </div>
                                                                {:else}
                                                                    <span class="text-muted small">-</span>
                                                                {/if}
                                                            </td>
                                                        {/each}

                                                        <td>{branch.approved}</td>
                                                        <td>{branch.admissions}</td>
                                                        <td>
                                                            <span class="badge {calculateVacancy(branch.capacity, branch.admissions) > 0 ? 'bg-warning text-dark' : 'bg-success'}">
                                                                {calculateVacancy(branch.capacity, branch.admissions)}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                {/each}
                                                <tr class="table-secondary fw-bold text-center align-middle">
                                                    <td class="text-start">Total</td>
                                                    <td>{branchTotal(course.branches, 'capacity')}</td>
                                                    <td>{branchTotal(course.branches, 'uniqueCount')}</td>
                                                    <td>{branchTotal(course.branches, 'commonCount')}</td>
                                                    
                                                    {#each collegeGroup.uniqueFormTypes as fType}
                                                        <td>
                                                            {course.branches.reduce((sum, b) => sum + (b.formTypes[fType]?.approved || 0), 0)}
                                                        </td>
                                                    {/each}

                                                    <td>{branchTotal(course.branches, 'approved')}</td>
                                                    <td>{branchTotal(course.branches, 'admissions')}</td>
                                                    <td>
                                                        <span class="badge {calculateVacancy(branchTotal(course.branches, 'capacity'), branchTotal(course.branches, 'admissions')) > 0 ? 'bg-warning text-dark' : 'bg-success'}">
                                                            {calculateVacancy(branchTotal(course.branches, 'capacity'), branchTotal(course.branches, 'admissions'))}
                                                        </span>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
    {:else}
        <div class="alert alert-warning">No capacity data is available for your assigned college or across the system.</div>
    {/if}
</div>

<style>
    .x-small { font-size: 0.75rem; }
    .table-responsive {
        border-radius: 0 0 0.375rem 0.375rem;
    }
</style>
