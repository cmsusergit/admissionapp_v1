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

        data.capacityData.forEach((course: any) => {
            if (course.branches && course.branches.length > 0) {
                const sheetData = course.branches.map((branch: any) => ({
                    'Branch Name': branch.name,
                    'Intake Capacity': branch.capacity,
                    'Approved Applications': branch.approved,
                    'Admissions Done': branch.admissions,
                    'Vacancy': calculateVacancy(branch.capacity, branch.admissions),
                }));

                const worksheet = XLSX.utils.json_to_sheet(sheetData);
                const sheetName = course.courseName.substring(0, 31).replace(/[\\/?*\[\]]/g, '');
                XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
            }
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
            <p class="text-muted mb-0">View branch-wise intake capacity, approved applications, admissions done, and vacancy.</p>
        </div>
        <button class="btn btn-success" on:click={downloadCapacityReport}>
            <i class="bi bi-file-earmark-excel"></i> Export to Excel
        </button>
    </div>

    {#if data.capacityData && data.capacityData.length > 0}
        <div class="row g-4">
            {#each data.capacityData as course (course.courseName)}
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
                                <table class="table table-striped table-hover mb-0">
                                    <thead class="table-light">
                                        <tr>
                                            <th>Branch</th>
                                            <th class="text-center">Intake Capacity</th>
                                            <th class="text-center">Approved Applications</th>
                                            <th class="text-center">Admissions Done</th>
                                            <th class="text-center">Vacancy</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each course.branches as branch (branch.id)}
                                            <tr>
                                                <td class="fw-bold">{branch.name}</td>
                                                <td class="text-center">{branch.capacity}</td>
                                                <td class="text-center">{branch.approved}</td>
                                                <td class="text-center">{branch.admissions}</td>
                                                <td class="text-center">
                                                    <span class="badge {calculateVacancy(branch.capacity, branch.admissions) > 0 ? 'bg-warning text-dark' : 'bg-success'}">
                                                        {calculateVacancy(branch.capacity, branch.admissions)}
                                                    </span>
                                                </td>
                                            </tr>
                                        {/each}
                                        <tr class="table-secondary fw-bold">
                                            <td>Total</td>
                                            <td class="text-center">{branchTotal(course.branches, 'capacity')}</td>
                                            <td class="text-center">{branchTotal(course.branches, 'approved')}</td>
                                            <td class="text-center">{branchTotal(course.branches, 'admissions')}</td>
                                            <td class="text-center">
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
    {:else}
        <div class="alert alert-warning">No capacity data is available for your assigned college or across the system.</div>
    {/if}
</div>
