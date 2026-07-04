<script lang="ts">
    import { page } from "$app/state";
    import { untrack } from "svelte";

    let { data } = $props();

    let searchVal = $state("");
    let filterFormType = $state("exclude_provisional");
    let filterAdmissionType = $state("all");

    let showModal = $state(false);
    let selectedFields = $state<string[]>([]);

    const staticFields = [
        { key: 'Sr. No', label: 'Sr. No' },
        { key: 'College Name', label: 'College Name' },
        { key: 'College ID (Enrollment No)', label: 'College ID (Enrollment No)' },
        { key: 'Admission ID', label: 'Admission ID' },
        { key: 'Student Name', label: 'Student Name' },
        { key: 'Email', label: 'Email' },
        { key: 'Merit Score', label: 'Merit Score' },
        { key: 'Form Type', label: 'Form Type' },
        { key: 'Admission Mode', label: 'Admission Mode' },
        { key: 'Admitted Date', label: 'Admitted Date' }
    ];

    let dynamicFields = $derived.by(() => {
        const keys = new Set<string>();
        data.students.forEach((s: any) => {
            if (s.formData && typeof s.formData === 'object') {
                Object.keys(s.formData).forEach(k => keys.add(k));
            }
        });
        return Array.from(keys).sort().map(k => ({
            key: `Form Field: ${k}`,
            label: `Form Field: ${k}`
        }));
    });

    let allFields = $derived([...staticFields, ...dynamicFields]);

    // Initialize selectedFields from localStorage or default on mount
    $effect(() => {
        const storageKey = `hod_export_template_${data.department.branchName}`;
        const saved = localStorage.getItem(storageKey);
        untrack(() => {
            if (saved) {
                try {
                    selectedFields = JSON.parse(saved);
                } catch (e) {
                    selectedFields = allFields.map(f => f.key);
                }
            } else {
                selectedFields = allFields.map(f => f.key);
            }
        });
    });

    function saveTemplate() {
        const storageKey = `hod_export_template_${data.department.branchName}`;
        localStorage.setItem(storageKey, JSON.stringify(selectedFields));
        showModal = false;
    }

    function resetToDefault() {
        selectedFields = allFields.map(f => f.key);
    }

    let downloadUrl = $derived.by(() => {
        const params = new URLSearchParams();
        if (selectedFields.length > 0) {
            params.append('fields', selectedFields.join(','));
        }
        if (filterFormType !== 'all') {
            params.append('form_type', filterFormType);
        }
        if (filterAdmissionType !== 'all') {
            params.append('admission_type', filterAdmissionType);
        }
        if (searchVal.trim() !== '') {
            params.append('search', searchVal.trim());
        }
        return `/hod/export?${params.toString()}`;
    });

    // Extract unique form types and admission types for filter dropdowns
    let formTypes = $derived([
        ...new Set(data.students.map((s: any) => s.formType).filter(Boolean))
    ]);
    
    let admissionTypes = $derived([
        ...new Set(data.students.map((s: any) => s.admissionType).filter(Boolean))
    ]);

    // Reactively filter students based on search term and filters
    let filteredStudents = $derived(
        data.students.filter((student: any) => {
            const matchesSearch = 
                student.fullName.toLowerCase().includes(searchVal.toLowerCase()) ||
                student.email.toLowerCase().includes(searchVal.toLowerCase()) ||
                student.enrollmentNumber.toLowerCase().includes(searchVal.toLowerCase()) ||
                student.admissionNumber.toLowerCase().includes(searchVal.toLowerCase());

            const matchesForm = 
                filterFormType === "all" ? true :
                filterFormType === "exclude_provisional" ? student.formType !== "Provisional" :
                student.formType === filterFormType;
                
            const matchesAdmission = filterAdmissionType === "all" || student.admissionType === filterAdmissionType;

            return matchesSearch && matchesForm && matchesAdmission;
        })
    );

    // Dynamic stats
    let totalAdmitted = $derived(data.students.length);
    let filteredCount = $derived(filteredStudents.length);
</script>

<div class="container-fluid py-4">
    <!-- Header -->
    <div class="row mb-4">
        <div class="col-12 d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
                <h1 class="h2 mb-1 text-dark fw-bold">Department Report</h1>
                <nav aria-label="breadcrumb">
                    <ol class="breadcrumb mb-0">
                        <li class="breadcrumb-item text-muted">{data.department.collegeName}</li>
                        <li class="breadcrumb-item text-muted">{data.department.courseName}</li>
                        <li class="breadcrumb-item active text-primary fw-semibold" aria-current="page">
                            {data.department.branchName}
                        </li>
                    </ol>
                </nav>
            </div>
            
            <div class="d-flex align-items-center gap-2">
                <button 
                    type="button"
                    class="btn btn-outline-primary d-flex align-items-center gap-2 px-3 shadow-sm"
                    onclick={() => showModal = true}
                >
                    <i class="bi bi-gear-fill"></i>
                    <span>Configure Columns</span>
                </button>
                <a 
                    href={downloadUrl} 
                    class="btn btn-success d-flex align-items-center gap-2 px-4 shadow-sm"
                    download
                >
                    <i class="bi bi-file-earmark-excel-fill fs-5"></i>
                    <span class="fw-semibold">Export Admitted Students</span>
                </a>
            </div>
        </div>
    </div>

    <!-- Quick Stats Row -->
    <div class="row g-3 mb-4">
        <div class="col-md-4">
            <div class="card border-0 shadow-sm bg-primary text-white h-100">
                <div class="card-body d-flex align-items-center justify-content-between">
                    <div>
                        <h6 class="text-white-50 text-uppercase mb-2 small fw-bold">Total Admitted</h6>
                        <h3 class="display-6 mb-0 fw-bold">{totalAdmitted}</h3>
                    </div>
                    <div class="bg-white bg-opacity-20 p-3 rounded-circle">
                        <i class="bi bi-people-fill fs-2 text-white"></i>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-md-4">
            <div class="card border-0 shadow-sm bg-info text-white h-100">
                <div class="card-body d-flex align-items-center justify-content-between">
                    <div>
                        <h6 class="text-white-50 text-uppercase mb-2 small fw-bold">Filtered Count</h6>
                        <h3 class="display-6 mb-0 fw-bold">{filteredCount}</h3>
                    </div>
                    <div class="bg-white bg-opacity-20 p-3 rounded-circle">
                        <i class="bi bi-funnel-fill fs-2 text-white"></i>
                    </div>
                </div>
            </div>
        </div>
        <div class="col-md-4">
            <div class="card border-0 shadow-sm bg-white h-100">
                <div class="card-body d-flex align-items-center justify-content-between">
                    <div>
                        <h6 class="text-muted text-uppercase mb-2 small fw-bold">Status Mode</h6>
                        <h4 class="mb-0 fw-bold text-success d-flex align-items-center gap-2">
                            <span class="badge bg-success-subtle text-success border border-success px-3 py-2 fs-6">
                                Final Admitted
                            </span>
                        </h4>
                    </div>
                    <div class="bg-light p-3 rounded-circle">
                        <i class="bi bi-patch-check-fill fs-2 text-success"></i>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Data Table Card -->
    <div class="card border-0 shadow-sm">
        <!-- Filters Header -->
        <div class="card-header bg-white border-bottom py-3">
            <div class="row g-3 align-items-center">
                <!-- Search Input -->
                <div class="col-md-4">
                    <div class="input-group">
                        <span class="input-group-text bg-light border-end-0 text-muted">
                            <i class="bi bi-search"></i>
                        </span>
                        <input 
                            type="text" 
                            class="form-control bg-light border-start-0 ps-0" 
                            placeholder="Search by Name, ID or Email..."
                            bind:value={searchVal}
                        />
                    </div>
                </div>
                
                <!-- Form Type Filter -->
                <div class="col-md-3">
                    <select class="form-select bg-light" bind:value={filterFormType}>
                        <option value="exclude_provisional">Exclude Provisional (Default)</option>
                        <option value="all">All Form Types (Incl. Provisional)</option>
                        {#each formTypes as type}
                            <option value={type}>{type}</option>
                        {/each}
                    </select>
                </div>

                <!-- Admission Mode Filter -->
                <div class="col-md-3">
                    <select class="form-select bg-light" bind:value={filterAdmissionType}>
                        <option value="all">All Admission Modes</option>
                        {#each admissionTypes as mode}
                            <option value={mode}>{mode}</option>
                        {/each}
                    </select>
                </div>

                <!-- Reset Button -->
                <div class="col-md-2 text-md-end">
                    <button 
                        class="btn btn-outline-secondary w-100" 
                        onclick={() => { searchVal = ""; filterFormType = "exclude_provisional"; filterAdmissionType = "all"; }}
                    >
                        Reset Filters
                    </button>
                </div>
            </div>
        </div>

        <!-- Table Body -->
        <div class="table-responsive" style="max-height: 60vh;">
            <table class="table table-hover align-middle mb-0">
                <thead class="table-light text-uppercase fs-7 fw-bold text-muted border-bottom">
                    <tr>
                        <th class="ps-4" style="width: 80px;">Sr. No</th>
                        <th>College ID</th>
                        <th>Admission ID</th>
                        <th>Student Name</th>
                        <th>Email</th>
                        <th>Merit Score</th>
                        <th>Form Type</th>
                        <th>Mode</th>
                        <th class="pe-4">College</th>
                    </tr>
                </thead>
                <tbody class="border-top-0">
                    {#each filteredStudents as student, i}
                        <tr>
                            <td class="ps-4 fw-semibold text-muted">{i + 1}</td>
                            <td>
                                <span class="badge bg-secondary-subtle text-secondary border font-monospace px-2 py-1 fs-7">
                                    {student.enrollmentNumber}
                                </span>
                            </td>
                            <td>
                                <span class="badge bg-primary-subtle text-primary border font-monospace px-2 py-1 fs-7">
                                    {student.admissionNumber}
                                </span>
                            </td>
                            <td>
                                <div class="fw-bold text-dark">{student.fullName}</div>
                            </td>
                            <td class="text-muted">{student.email}</td>
                            <td class="fw-semibold text-dark">{student.meritScore}</td>
                            <td>
                                <span class="badge bg-light text-dark border px-2 py-1">
                                    {student.formType}
                                </span>
                            </td>
                            <td>
                                <span class="badge bg-info-subtle text-info border px-2 py-1">
                                    {student.admissionType}
                                </span>
                            </td>
                            <td class="pe-4 text-muted small">{student.collegeName}</td>
                        </tr>
                    {:else}
                        <tr>
                            <td colspan="9" class="text-center py-5 text-muted">
                                <div class="mb-2 fs-4">
                                    <i class="bi bi-inbox text-muted opacity-50"></i>
                                </div>
                                <div>No final admitted students match your selection criteria.</div>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
        
        <!-- Footer info -->
        <div class="card-footer bg-white border-top text-muted small py-3">
            Showing {filteredCount} of {totalAdmitted} admitted students in your department.
        </div>
    </div>
</div>

{#if showModal}
    <div class="modal fade show d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5); z-index: 1050;">
        <div class="modal-dialog modal-lg modal-dialog-scrollable modal-dialog-centered">
            <div class="modal-content shadow border-0">
                <div class="modal-header bg-light border-0 py-3">
                    <h5 class="modal-title fw-bold text-dark d-flex align-items-center gap-2">
                        <i class="bi bi-layout-three-columns text-primary"></i>
                        Configure Excel Columns
                    </h5>
                    <button type="button" class="btn-close" onclick={() => showModal = false}></button>
                </div>
                <div class="modal-body p-4" style="max-height: calc(100vh - 200px); overflow-y: auto;">
                    <div class="alert alert-info border-0 bg-light-primary text-primary small mb-4">
                        <i class="bi bi-info-circle-fill me-2"></i>
                        Choose which student profile and application fields to include in your Excel sheet. Your selection is automatically saved as your template.
                    </div>
                    
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <div class="btn-group btn-group-sm">
                            <button type="button" class="btn btn-outline-secondary" onclick={() => selectedFields = allFields.map(f => f.key)}>
                                Select All
                            </button>
                            <button type="button" class="btn btn-outline-secondary" onclick={() => selectedFields = []}>
                                Deselect All
                            </button>
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-danger" onclick={resetToDefault}>
                            Reset to System Default
                        </button>
                    </div>

                    <div class="row g-4">
                        <div class="col-md-6 border-end">
                            <h6 class="fw-bold small text-secondary text-uppercase tracking-wider mb-3">
                                <i class="bi bi-person-badge-fill me-1"></i> Profile (Static Fields)
                            </h6>
                            <div class="pe-2">
                                {#each staticFields as field}
                                    <div class="form-check py-2 border-bottom border-light">
                                        <input type="checkbox" class="form-check-input" id="field_{field.key}" value={field.key} bind:group={selectedFields}>
                                        <label class="form-check-label small fw-semibold text-dark cursor-pointer" for="field_{field.key}">
                                            {field.label}
                                        </label>
                                    </div>
                                {/each}
                            </div>
                        </div>
                        <div class="col-md-6">
                            <h6 class="fw-bold small text-secondary text-uppercase tracking-wider mb-3">
                                <i class="bi bi-list-nested me-1"></i> Custom Application Fields
                            </h6>
                            <div>
                                {#if dynamicFields.length === 0}
                                    <div class="text-center py-4">
                                        <i class="bi bi-file-earmark-text text-muted fs-3 mb-2 d-block"></i>
                                        <span class="text-muted small">No custom form fields are active.</span>
                                    </div>
                                {:else}
                                    <div style="max-height: 350px; overflow-y: auto;" class="pe-2">
                                        {#each dynamicFields as field}
                                            <div class="form-check py-2 border-bottom border-light">
                                                <input type="checkbox" class="form-check-input" id="field_{field.key}" value={field.key} bind:group={selectedFields}>
                                                <label class="form-check-label small fw-semibold text-dark cursor-pointer" for="field_{field.key}">
                                                    {field.label.replace('Form Field: ', '')}
                                                </label>
                                            </div>
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer bg-light border-0 py-3">
                    <button type="button" class="btn btn-sm btn-secondary px-3" onclick={() => showModal = false}>Cancel</button>
                    <button type="button" class="btn btn-sm btn-success px-4" onclick={saveTemplate}>
                        Save Template & Apply
                    </button>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    .fs-7 {
        font-size: 0.75rem;
    }
</style>
