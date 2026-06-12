<script lang="ts">
    import type { PageData } from './$types';
    import * as XLSX from 'xlsx';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    let { data } = $props<{ data: PageData }>();

    let viewMode = $state<'detailed' | 'simple'>('simple');
    let selectedMetric = $state<'all' | 'submitted' | 'approved' | 'paid' | 'admitted' | 'admitted_id' | 'admitted_paid'>('approved');
    let includeUnassigned = $state(false);

    // Derived filtered data
    let filteredCapacityData = $derived(
        data.capacityData.map(college => ({
            ...college,
            courses: college.courses.map((course: any) => ({
                ...course,
                filteredBranches: includeUnassigned 
                    ? course.branches 
                    : (course.branches || []).filter((b: any) => b.name !== 'Unassigned/Other')
            }))
        }))
    );

    function branchTotal(branches: any[], field: string): number {
        const filtered = includeUnassigned ? branches : (branches || []).filter(b => b.name !== 'Unassigned/Other');
        
        if (field === 'capacity') return filtered.reduce((sum, branch) => sum + (branch.capacity || 0), 0);
        if (field === 'metric_total') {
            return filtered.reduce((sum, branch) => sum + (branch.metrics?.[selectedMetric]?.total || 0), 0);
        }
        return filtered.reduce((sum, branch) => sum + (branch?.[field] || 0), 0);
    }

    function courseMetricTotal(branches: any[], fType: string): number {
        const filtered = includeUnassigned ? branches : (branches || []).filter(b => b.name !== 'Unassigned/Other');
        return filtered.reduce((sum, branch) => sum + (branch.metrics?.[selectedMetric]?.formTypes?.[fType] || 0), 0);
    }

    let grandTotalCapacity = $derived(
        filteredCapacityData.reduce((acc, college) => {
            return acc + college.courses.reduce((cAcc: number, course: any) => cAcc + branchTotal(course.filteredBranches, 'capacity'), 0);
        }, 0)
    );

    let grandTotalMetricTotal = $derived(
        filteredCapacityData.reduce((acc, college) => {
            return acc + college.courses.reduce((cAcc: number, course: any) => cAcc + branchTotal(course.filteredBranches, 'metric_total'), 0);
        }, 0)
    );

    let grandMetricTotals = $derived(
        (data.globalUniqueFormTypes || []).map(fType => {
            return filteredCapacityData.reduce((acc, college) => {
                return acc + college.courses.reduce((cAcc: number, course: any) => cAcc + courseMetricTotal(course.filteredBranches, fType), 0);
            }, 0);
        })
    );

    function handleYearChange(event: Event) {
        const target = event.target as HTMLSelectElement;
        const params = new URLSearchParams($page.url.searchParams);
        params.set('academic_year_id', target.value);
        goto(`?${params.toString()}`);
    }

    function handleRejectedToggle(event: Event) {
        const target = event.target as HTMLInputElement;
        const params = new URLSearchParams($page.url.searchParams);
        params.set('include_rejected', target.checked.toString());
        goto(`?${params.toString()}`);
    }

    const metrics = [
        { id: 'approved', label: 'Approved Apps', icon: 'bi-check-all' },
        { id: 'paid', label: 'Paid Students', icon: 'bi-currency-dollar' },
        { id: 'submitted', label: 'Submitted Apps', icon: 'bi-file-earmark-check' },
        { id: 'admitted_id', label: 'ID Generated', icon: 'bi-person-vcard' },
        { id: 'admitted_paid', label: 'ID & Paid', icon: 'bi-person-check' },
        { id: 'admitted', label: 'Final Admissions', icon: 'bi-person-badge' },
        { id: 'all', label: 'All Applications', icon: 'bi-list-ul' }
    ];

    function calculateVacancy(capacity: number, admissions: number): number {
        return Math.max(0, capacity - admissions);
    }

    async function downloadPDF() {
        if (!data.capacityData || data.capacityData.length === 0) {
            alert('No capacity data available to export.');
            return;
        }

        const metricLabel = metrics.find(m => m.id === selectedMetric)?.label.toUpperCase() || 'UNKNOWN';

        try {
            // Dynamic import to avoid SSR issues and only load when needed
            const pdfMakeModule = await import('pdfmake/build/pdfmake.js');
            const pdfFontsModule = await import('pdfmake/build/vfs_fonts.js');
            const pdfMake: any = pdfMakeModule.default || pdfMakeModule;
            const pdfFonts: any = pdfFontsModule.default || pdfFontsModule;
            
            pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

            const tableBody = [];
            
            // Header
            const headerRow = ['COURSE / BRANCH', 'INTAKE'];
            data.globalUniqueFormTypes.forEach(f => headerRow.push(f.toUpperCase()));
            tableBody.push(headerRow.map(text => ({ text, style: 'tableHeader' })));

            // Data Rows
            filteredCapacityData.forEach(college => {
                college.courses.forEach((course: any) => {
                    // Course Header Row
                    tableBody.push([
                        { text: course.courseName.toUpperCase(), colSpan: headerRow.length, style: 'courseHeader' },
                        ...Array(headerRow.length - 1).fill('')
                    ]);

                    // Branches
                    course.filteredBranches.forEach((branch: any) => {
                        const row = [branch.name, branch.capacity.toString()];
                        data.globalUniqueFormTypes.forEach((fType: string) => {
                            row.push((branch.metrics?.[selectedMetric]?.formTypes?.[fType] || 0).toString());
                        });
                        tableBody.push(row.map((text, idx) => ({ 
                            text, 
                            alignment: idx === 0 ? 'left' : 'center',
                            bold: idx > 1 && parseInt(text) > 0
                        })));
                    });

                    // Subtotal
                    const subtotalRow = [{ text: 'Total :-', alignment: 'right', bold: true }, branchTotal(course.branches, 'capacity').toString()];
                    data.globalUniqueFormTypes.forEach((fType: string) => {
                        subtotalRow.push(courseMetricTotal(course.branches, fType).toString());
                    });
                    
                    tableBody.push(subtotalRow.map((cell: any, idx) => {
                        const cellObj = typeof cell === 'string' ? { text: cell } : cell;
                        return { ...cellObj, bold: true, fillColor: '#f8f9fa', alignment: idx === 0 ? 'right' : 'center' };
                    }));
                });
            });

            // Grand Total
            const grandTotalRow = [{ text: 'GRAND Total :-', alignment: 'right', bold: true, fontSize: 12 }, grandTotalCapacity.toString()];
            grandMetricTotals.forEach((total: number) => {
                grandTotalRow.push(total.toString());
            });
            
            tableBody.push(grandTotalRow.map((cell: any, idx) => {
                const cellObj = typeof cell === 'string' ? { text: cell } : cell;
                return { 
                    ...cellObj, 
                    bold: true, 
                    fontSize: 12, 
                    fillColor: '#e9ecef',
                    color: 'black',
                    alignment: idx === 0 ? 'right' : 'center'
                };
            }));

            const docDefinition = {
                pageSize: 'A4',
                pageOrientation: data.globalUniqueFormTypes.length > 5 ? 'landscape' : 'portrait',
                pageMargins: [20, 20, 20, 20],
                content: [
                    { text: `CAPACITY REPORT - ${metricLabel}`, style: 'header' },
                    { text: `Report Date: ${new Date().toLocaleDateString('en-GB')}`, style: 'subheader' },
                    {
                        table: {
                            headerRows: 1,
                            widths: ['*', 'auto', ...data.globalUniqueFormTypes.map(() => 'auto')],
                            body: tableBody
                        },
                        layout: {
                            hLineWidth: function (i: number, node: any) {
                                return (i === 0 || i === node.table.body.length) ? 1.5 : 0.5;
                            },
                            vLineWidth: function (i: number, node: any) {
                                return (i === 0 || i === node.table.widths.length) ? 1.5 : 0.5;
                            },
                            hLineColor: function (i: number) {
                                return (i === 0 || i === 1) ? 'black' : '#dddddd';
                            },
                            vLineColor: function (i: number) {
                                return '#dddddd';
                            },
                            paddingLeft: function(i: number) { return 4; },
                            paddingRight: function(i: number) { return 4; },
                            paddingTop: function(i: number) { return 2; },
                            paddingBottom: function(i: number) { return 2; }
                        }
                    }
                ],
                styles: {
                    header: { fontSize: 13, bold: true, alignment: 'center', margin: [0, 0, 0, 2] },
                    subheader: { fontSize: 8, alignment: 'center', margin: [0, 0, 0, 10], color: '#666666' },
                    tableHeader: { bold: true, fontSize: 8.5, color: 'black', fillColor: '#f1f1f1', alignment: 'center', margin: [0, 2, 0, 2] },
                    courseHeader: { bold: true, fontSize: 9, fillColor: '#f8f9fa', margin: [2, 2, 2, 2] }
                },
                defaultStyle: {
                    fontSize: 8
                }
            };

            pdfMake.createPdf(docDefinition).download(`${metricLabel.replace(' ', '_')}_Capacity_Report_${new Date().toISOString().split('T')[0]}.pdf`);
        } catch (error) {
            console.error('PDF Generation Error:', error);
            alert('Failed to generate PDF. Please try again.');
        }
    }

    async function downloadCapacityReport() {
        if (!data.capacityData || data.capacityData.length === 0) {
            alert('No capacity data available to export.');
            return;
        }

        const workbook = XLSX.utils.book_new();
        const metricLabel = metrics.find(m => m.id === selectedMetric)?.label || 'Metric';

        filteredCapacityData.forEach((collegeGroup: any) => {
            collegeGroup.courses.forEach((course: any) => {
                const branchesToExport = course.filteredBranches;
                if (branchesToExport && branchesToExport.length > 0) {
                    const sheetData = branchesToExport.map((branch: any) => {
                        if (viewMode === 'simple') {
                            const row: any = {
                                'Branch Name': branch.name,
                                'INTAKE': branch.capacity,
                            };
                            data.globalUniqueFormTypes.forEach((ft: string) => {
                                row[ft] = branch.metrics?.[selectedMetric]?.formTypes?.[ft] || 0;
                            });
                            return row;
                        } else {
                            const row: any = {
                                'College': collegeGroup.collegeName,
                                'Branch Name': branch.name,
                                'Intake Capacity': branch.capacity,
                                'Unique Students': branch.uniqueCount,
                                'Common Applicants': branch.commonCount,
                            };

                            // Add dynamic form type columns
                            data.globalUniqueFormTypes.forEach((fType: string) => {
                                const stats = branch.formTypes[fType];
                                row[`${fType} (Total/Appr)`] = stats ? `${stats.total} / ${stats.approved}` : '0 / 0';
                            });

                            row['Total Approved'] = branch.approved;
                            row['Admissions Done (ID Gen)'] = branch.metrics.admitted_id.total;
                            row['Tuition Paid'] = branch.metrics.admitted_paid.total;
                            row['Vacancy'] = calculateVacancy(branch.capacity, branch.metrics.admitted_id.total);

                            return row;
                        }
                    });

                    // Add Subtotal row for simple view
                    if (viewMode === 'simple') {
                        const subtotal: any = {
                            'Branch Name': 'Total :-',
                            'INTAKE': branchTotal(course.branches, 'capacity'),
                        };
                        data.globalUniqueFormTypes.forEach((ft: string) => {
                            subtotal[ft] = courseMetricTotal(course.branches, ft);
                        });
                        sheetData.push(subtotal);
                    }

                    const worksheet = XLSX.utils.json_to_sheet(sheetData);
                    const prefix = viewMode === 'simple' ? `${metricLabel.replace(' ', '_')}_` : '';
                    const sheetName = `${prefix}${course.courseName.substring(0, 20)}`.replace(/[\\/?*\[\]]/g, '');
                    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
                }
            });
        });

        const fileName = viewMode === 'simple' ? `Simple_Capacity_Report_${metricLabel.replace(' ', '_')}.xlsx` : 'Detailed_Capacity_Report.xlsx';
        XLSX.writeFile(workbook, fileName);
    }
</script>

<div class="container-fluid mt-4">
    <div class="d-flex justify-content-between align-items-center mb-3">
        <div>
            <h1 class="mb-1">Capacity Report</h1>
            <p class="text-muted mb-2">
                {viewMode === 'simple' 
                    ? 'Summarized view of admitted students categorized by form type.' 
                    : 'Detailed intake capacity, unique student counts, and application breakdowns.'}
            </p>

            <!-- Filters Row -->
            <div class="d-flex align-items-center bg-white border rounded px-3 py-2 shadow-sm" style="width: fit-content;">
                <div class="form-check mb-0 me-3 border-end pe-3">
                    <input class="form-check-input" type="checkbox" id="includeUnassigned" bind:checked={includeUnassigned}>
                    <label class="form-check-label small fw-bold" for="includeUnassigned">
                        Include Unassigned
                    </label>
                </div>
                <div class="form-check mb-0">
                    <input 
                        class="form-check-input" 
                        type="checkbox" 
                        id="includeRejected" 
                        checked={data.includeRejected}
                        onchange={handleRejectedToggle}
                    >
                    <label class="form-check-label small fw-bold" for="includeRejected">
                        Include Rejected/Removed
                    </label>
                </div>
            </div>
        </div>
        <div class="d-flex gap-2 align-self-start">
            <div class="me-2">
                <select 
                    class="form-select shadow-sm" 
                    value={data.selectedYearId} 
                    onchange={handleYearChange}
                >
                    {#each data.academicYears as year}
                        <option value={year.id}>
                            {year.name} {year.id === data.activeYearId ? '(Active)' : ''}
                        </option>
                    {/each}
                </select>
            </div>
            {#if viewMode === 'simple'}
                <div class="dropdown me-2">
                    <button class="btn btn-outline-dark dropdown-toggle shadow-sm" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                        <i class={metrics.find(m => m.id === selectedMetric)?.icon}></i> 
                        {metrics.find(m => m.id === selectedMetric)?.label}
                    </button>
                    <ul class="dropdown-menu shadow">
                        {#each metrics as metric}
                            <li>
                                <button 
                                    class="dropdown-item d-flex align-items-center gap-2 {selectedMetric === metric.id ? 'active' : ''}" 
                                    onclick={() => selectedMetric = metric.id as any}
                                >
                                    <i class={metric.icon}></i> {metric.label}
                                </button>
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}

            <div class="btn-group shadow-sm">
                <button 
                    class="btn {viewMode === 'detailed' ? 'btn-primary' : 'btn-outline-primary'}" 
                    onclick={() => viewMode = 'detailed'}
                >
                    Detailed View
                </button>
                <button 
                    class="btn {viewMode === 'simple' ? 'btn-primary' : 'btn-outline-primary'}" 
                    onclick={() => viewMode = 'simple'}
                >
                    Simple View
                </button>
            </div>

            <div class="btn-group shadow-sm">
                <button class="btn btn-success" onclick={downloadCapacityReport}>
                    <i class="bi bi-file-earmark-excel"></i> Export Excel
                </button>
                {#if viewMode === 'simple'}
                    <button class="btn btn-danger" onclick={downloadPDF}>
                        <i class="bi bi-file-earmark-pdf"></i> Export PDF
                    </button>
                {/if}
            </div>
        </div>
    </div>

    {#if data.capacityData && data.capacityData.length > 0}
        {#if viewMode === 'detailed'}
            {#each filteredCapacityData as collegeGroup (collegeGroup.collegeName)}
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
                                            Total Intake: {branchTotal(course.filteredBranches, 'capacity')}
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
                                                        <th rowspan="2">Approved / Admitted<br><small class="fw-normal text-muted" style="font-size: 0.7rem;">(Appr / ID Gen)</small></th>
                                                        <th rowspan="2">Admissions Done<br><small class="fw-normal text-muted" style="font-size: 0.7rem;">(ID Gen / Paid)</small></th>
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
                                                    {#each course.filteredBranches as branch (branch.id)}
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

                                                            <td>
                                                                <div class="d-flex flex-column align-items-center">
                                                                    <span class="fw-bold" title="Total Approved">{branch.approved}</span>
                                                                    <span class="text-secondary" style="font-size: 0.75rem;" title="College ID Generated">(ID: {branch.metrics.admitted_id.total})</span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div class="d-flex flex-column align-items-center">
                                                                    <span class="fw-bold" title="College ID Generated">{branch.metrics.admitted_id.total}</span>
                                                                    <span class="text-primary" style="font-size: 0.75rem;" title="Tuition Fee Paid">(Paid: {branch.metrics.admitted_paid.total})</span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <span class="badge {calculateVacancy(branch.capacity, branch.metrics.admitted_id.total) > 0 ? 'bg-warning text-dark' : 'bg-success'}">
                                                                    {calculateVacancy(branch.capacity, branch.metrics.admitted_id.total)}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    {/each}
                                                    <tr class="table-secondary fw-bold text-center align-middle">
                                                        <td class="text-start">Total</td>
                                                        <td>{branchTotal(course.filteredBranches, 'capacity')}</td>
                                                        <td>{branchTotal(course.filteredBranches, 'uniqueCount')}</td>
                                                        <td>{branchTotal(course.filteredBranches, 'commonCount')}</td>
                                                        
                                                        {#each collegeGroup.uniqueFormTypes as fType}
                                                            <td>
                                                                {course.filteredBranches.reduce((sum, b) => sum + (b.formTypes[fType]?.approved || 0), 0)}
                                                            </td>
                                                        {/each}

                                                        <td>
                                                            <div class="d-flex flex-column align-items-center">
                                                                <span>{branchTotal(course.filteredBranches, 'approved')}</span>
                                                                <span class="text-secondary" style="font-size: 0.75rem;">(ID: {course.filteredBranches.reduce((sum, b) => sum + (b.metrics.admitted_id.total || 0), 0)})</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <div class="d-flex flex-column align-items-center">
                                                                <span>{course.filteredBranches.reduce((sum, b) => sum + (b.metrics.admitted_id.total || 0), 0)}</span>
                                                                <span class="text-primary" style="font-size: 0.75rem;">(Paid: {course.filteredBranches.reduce((sum, b) => sum + (b.metrics.admitted_paid.total || 0), 0)})</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <span class="badge {calculateVacancy(branchTotal(course.filteredBranches, 'capacity'), course.filteredBranches.reduce((sum, b) => sum + (b.metrics.admitted_id.total || 0), 0)) > 0 ? 'bg-warning text-dark' : 'bg-success'}">
                                                                {calculateVacancy(branchTotal(course.filteredBranches, 'capacity'), course.filteredBranches.reduce((sum, b) => sum + (b.metrics.admitted_id.total || 0), 0))}
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
        {/if}
        {#if viewMode === 'simple'}
            <!-- Simple View Table Matching PDF -->
            <div class="card shadow-sm border-0 bg-white">
                <div class="card-body p-4">
                    <div class="text-center mb-4">
                        <h4 class="fw-bold mb-1">CAPACITY REPORT - {metrics.find(m => m.id === selectedMetric)?.label.toUpperCase()}</h4>
                        <p class="text-muted small mb-0">{new Date().toLocaleDateString('en-GB')}</p>
                    </div>
                    
                    <div class="table-responsive">
                        <table class="table table-sm table-bordered simple-report border-dark">
                            <thead class="text-center align-middle fw-bold bg-light">
                                <tr class="border-dark border-bottom-2">
                                    <th class="text-start py-2">COURSE / BRANCH</th>
                                    <th style="width: 100px;">INTAKE</th>
                                    {#each data.globalUniqueFormTypes || [] as fType}
                                        <th style="width: 80px;">{fType.toUpperCase()}</th>
                                    {/each}
                                </tr>
                            </thead>
                            <tbody>
                                {#each filteredCapacityData as college}
                                    {#each college.courses as course}
                                        <tr class="bg-light fw-bold text-uppercase border-dark border-top-2 border-bottom-1">
                                            <td colspan={(data.globalUniqueFormTypes?.length || 0) + 2} class="py-2 px-3">
                                                {course.courseName}
                                            </td>
                                        </tr>
                                        {#each course.filteredBranches as branch}
                                            <tr class="text-center align-middle">
                                                <td class="text-start px-3">{branch.name}</td>
                                                <td>{branch.capacity}</td>
                                                {#each data.globalUniqueFormTypes || [] as fType}
                                                    <td class={(branch.metrics?.[selectedMetric]?.formTypes?.[fType] || 0) > 0 ? 'fw-bold' : 'text-muted'}>
                                                        {branch.metrics?.[selectedMetric]?.formTypes?.[fType] || 0}
                                                    </td>
                                                {/each}
                                            </tr>
                                        {/each}
                                        <!-- Course Subtotal -->
                                        <tr class="fw-bold text-center bg-light border-dark border-top-1 border-bottom-2">
                                            <td class="text-end px-3 py-2">Total :-</td>
                                            <td>{branchTotal(course.filteredBranches, 'capacity')}</td>
                                            {#each data.globalUniqueFormTypes || [] as fType}
                                                <td>{courseMetricTotal(course.filteredBranches, fType)}</td>
                                            {/each}
                                        </tr>
                                    {/each}
                                {/each}
                            </tbody>
                            <tfoot class="fw-bold text-center align-middle bg-light">
                                <tr class="border-dark border-top-3">
                                    <td class="text-end px-3 py-3 fs-5">GRAND Total :-</td>
                                    <td class="fs-5">{grandTotalCapacity}</td>
                                    {#each grandMetricTotals as total}
                                        <td class="fs-5">{total}</td>
                                    {/each}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        {/if}
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
