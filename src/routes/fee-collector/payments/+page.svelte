<script lang="ts">
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { toastStore } from '$lib/stores/toastStore';
    import { generateReceiptPDF, downloadReceiptPDF, type ReceiptData } from '$lib/utils/pdfGenerator';

    let { data } = $props();

    let searchTerm = $state(data.searchTerm || '');
    let selectedCourseId = $state(data.selectedCourseId || '');
    let activeTab: 'tuition' | 'application' | 'provisional' = $state(data.activeTab || 'tuition');

    $effect(() => {
        searchTerm = data.searchTerm || '';
        selectedCourseId = data.selectedCourseId || '';
        activeTab = (data.activeTab as any) || 'tuition';
    });

    function handleSearch() {
        const url = new URL(window.location.href);
        url.searchParams.set('search', searchTerm);
        url.searchParams.set('course_id', selectedCourseId);
        url.searchParams.set('page', '1');
        goto(url.toString());
    }

    function handleCourseChange() {
        handleSearch();
    }

    function handleTabChange(tab: typeof activeTab) {
        const url = new URL(window.location.href);
        url.searchParams.set('type', tab);
        url.searchParams.set('page', '1');
        goto(url.toString());
    }

    function changePage(newPage: number) {
        const url = new URL(window.location.href);
        url.searchParams.set('page', newPage.toString());
        goto(url.toString());
    }

    let filteredPayments = $derived(activeTab === 'tuition' ? data.tuitionPayments : 
                     activeTab === 'application' ? data.applicationFeePayments : 
                     data.provisionalFeePayments);

    // --- On-Demand Student Autocomplete State & Search ---
    let studentSearchQuery = $state('');
    let showStudentDropdown = $state(false);
    let admissionsList = $state<any[]>([]);
    let isSearchingAdmissions = $state(false);

    let debounceTimer: any;
    $effect(() => {
        if (debounceTimer) clearTimeout(debounceTimer);
        if (!studentSearchQuery.trim()) {
            admissionsList = [];
            return;
        }
        debounceTimer = setTimeout(async () => {
            isSearchingAdmissions = true;
            try {
                const res = await fetch(`/api/fee-collector/search-admissions?q=${encodeURIComponent(studentSearchQuery)}`);
                if (res.ok) {
                    admissionsList = await res.json();
                }
            } catch (e) {
                console.error(e);
            } finally {
                isSearchingAdmissions = false;
            }
        }, 300);
    });

    function recordStudentPayment(adm: any) {
        goto(`/fee-collector/payments/collect/${adm.id}`);
    }

    function handleWindowClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.student-autocomplete-container')) {
            showStudentDropdown = false;
        }
    }

    // Resolve non-blocking metadata once at the page level
    let profileTemplates = $state<any[]>([]);
    let formTypesMap = $state<any[]>([]);
    let isMetadataLoaded = $state(false);

    $effect(() => {
        Promise.all([data.streamed.profileTemplates, data.streamed.formTypes]).then(([pt, ft]) => {
            profileTemplates = pt;
            formTypesMap = ft;
            isMetadataLoaded = true;
        });
    });

    async function printReceipt(payment: any) {
        const receiptData = mapPaymentToReceipt(payment);
        await generateReceiptPDF(receiptData);
    }

    async function downloadReceipt(payment: any) {
        const receiptData = mapPaymentToReceipt(payment);
        await downloadReceiptPDF(receiptData);
    }

    function mapPaymentToReceipt(payment: any): ReceiptData {
        const isProv = payment.payment_type === 'provisional_fee';
        const isTuition = payment.payment_type === 'tuition_fee';
        const feePeriod = payment.fee_period || 'year';

        const feeBreakdown = (payment.fee_components_breakdown || []).map((section: any) => ({
            name: section.name || section.section,
            items: (section.items || []).map((item: any) => {
                const val = Number(item.amount) || 0;
                const displayAmt = (feePeriod === 'semester' && item.allow_partial) ? (val / 2) : val;
                return {
                    name: item.name,
                    amount: displayAmt
                };
            })
        }));
        
        let universityData = {
            name: 'SVIT, Vasad',
            address: 'Vasad, Gujarat',
            contactEmail: 'admission@svitvasad.ac.in',
            logoUrl: undefined
        };

        const college = payment.applications?.courses?.colleges;
        if (college) {
            universityData = {
                name: college.name || universityData.name,
                address: college.address || universityData.address,
                logoUrl: college.logo_url || college.universities?.logo_url,
                contactEmail: college.universities?.contact_email || universityData.contactEmail
            };
        }

        let periodDisplay: 'SEMESTER' | 'ACADEMIC YEAR';
        if (data.userProfile?.role === 'fee_collector' && isTuition) {
            periodDisplay = (feePeriod === 'year') ? 'ACADEMIC YEAR' : 'SEMESTER';
        } else {
            periodDisplay = 'ACADEMIC YEAR';
        }

        const studentProfiles = payment.applications?.student_user?.student_profiles;
        const enrollmentNumber = (Array.isArray(studentProfiles) ? studentProfiles[0] : studentProfiles)?.enrollment_number;

        return {
            receiptNumber: payment.receipt_number || 'N/A',
            date: payment.payment_date,
            studentName: payment.applications?.student_user?.full_name || payment.applications?.student_user?.email || 'N/A',
            email: payment.applications?.student_user?.email || '',
            enrollmentNumber: enrollmentNumber,
            admissionNumber: payment.applications?.account_admissions?.[0]?.admission_number,
            courseName: payment.applications?.courses?.name || 'N/A',
            branchName: payment.applications?.branches?.name,
            academicYear: payment.applications?.admission_cycles?.academic_years?.name,
            semester: periodDisplay,
            paymentType: payment.payment_type,
            isProvisional: isProv,
            transactionId: payment.transaction_id,
            amount: Number(payment.amount),
            totalStructureFee: Number(payment.amount),
            feeBreakdown: feeBreakdown.length > 0 ? feeBreakdown : undefined,
            collegeAlias: college?.code || 'SVIT',
            paymentModes: (payment.payment_breakdown || []).map((m: any) => ({
                mode: m.type || m.mode,
                amount: Number(m.amount),
                ref: m.ref || m.reference,
                date: payment.payment_date
            })),
            university: universityData
        };
    }
</script>

<svelte:window onclick={handleWindowClick} />

<div class="container-fluid">
    <h1 class="mb-4">Payment History</h1>

    <ul class="nav nav-tabs mb-4">
        <li class="nav-item">
            <a class="nav-link {activeTab === 'tuition' ? 'active' : ''}" href="#" onclick={(e) => { e.preventDefault(); handleTabChange('tuition'); }}>
                Tuition / Admission Fees
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link {activeTab === 'application' ? 'active' : ''}" href="#" onclick={(e) => { e.preventDefault(); handleTabChange('application'); }}>
                Application Form Fees
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link {activeTab === 'provisional' ? 'active' : ''}" href="#" onclick={(e) => { e.preventDefault(); handleTabChange('provisional'); }}>
                Provisional Fees
            </a>
        </li>
    </ul>

    <div class="d-flex justify-content-between align-items-center mb-3">
        <div class="d-flex gap-2 align-items-center">
            <div class="input-group student-autocomplete-container" style="max-width: 400px;">
                <span class="input-group-text"><i class="bi bi-search"></i></span>
                <input 
                    type="text" 
                    class="form-control" 
                    placeholder="Search by Name/Email/Adm No..." 
                    bind:value={searchTerm}
                    onkeydown={(e) => e.key === 'Enter' && handleSearch()}
                >
                <button class="btn btn-primary" onclick={handleSearch}>Search</button>
            </div>
            
            <div class="input-group" style="max-width: 300px;">
                <span class="input-group-text"><i class="bi bi-book"></i></span>
                <select 
                    class="form-select" 
                    bind:value={selectedCourseId}
                    onchange={handleCourseChange}
                >
                    <option value="">All Courses</option>
                    {#each data.courses as course}
                        <option value={course.id}>{course.name}</option>
                    {/each}
                </select>
            </div>

            {#if data.searchTerm || data.selectedCourseId}
                <button class="btn btn-link btn-sm text-danger" onclick={() => { searchTerm = ''; selectedCourseId = ''; handleSearch(); }}>Clear</button>
            {/if}
        </div>
        
        <div class="input-group student-autocomplete-container" style="max-width: 400px;">
            <span class="input-group-text">
                {#if isSearchingAdmissions}
                    <span class="spinner-border spinner-border-sm text-primary" role="status"></span>
                {:else}
                    <i class="bi bi-person-plus"></i>
                {/if}
            </span>
            <input 
                type="text" 
                class="form-control" 
                placeholder="Search Student to Record Payment..." 
                bind:value={studentSearchQuery}
                onfocus={() => showStudentDropdown = true}
            >
            {#if showStudentDropdown && admissionsList.length > 0}
                <div class="list-group position-absolute w-100 shadow-lg z-3 top-100 mt-1" style="max-height: 300px; overflow-y: auto;">
                    {#each admissionsList as adm}
                        <button 
                            type="button" 
                            class="list-group-item list-group-item-action text-start"
                            onclick={() => recordStudentPayment(adm)}
                        >
                            <div class="fw-bold">{adm.admission_number}</div>
                            <small class="text-muted">{(adm.applications as any)?.student_user?.full_name}</small>
                        </button>
                    {/each}
                </div>
            {/if}
        </div>
        {#if activeTab === 'tuition'}
            <div class="text-muted small">
                <i class="bi bi-info-circle me-1"></i> Search student to record new payment
            </div>
        {/if}
    </div>

    <div class="card">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Date</th>
                            <th>Admission No.</th>
                            <th>College ID</th>
                            <th>Student</th>
                            <th>Course</th>
                            <th>Total Amount</th>
                            <th>Modes</th>
                            <th>Status</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each filteredPayments as payment, i}
                            <tr>
                                <td>{(data.pagination.page - 1) * data.pagination.limit + i + 1}</td>
                                <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                                <td>{Array.isArray(payment.applications?.account_admissions) ? payment.applications?.account_admissions[0]?.admission_number : payment.applications?.account_admissions?.admission_number || '-'}</td>
                                <td>
                                    <span class="badge {(Array.isArray(payment.applications?.student_user?.student_profiles) ? payment.applications?.student_user?.student_profiles[0]?.enrollment_number : payment.applications?.student_user?.student_profiles?.enrollment_number) ? 'bg-success' : 'bg-light text-muted border'}">
                                        {(Array.isArray(payment.applications?.student_user?.student_profiles) ? payment.applications?.student_user?.student_profiles[0]?.enrollment_number : payment.applications?.student_user?.student_profiles?.enrollment_number) || 'Pending'}
                                    </span>
                                </td>
                                <td>
                                    {payment.applications?.student_user?.full_name || payment.applications?.student_user?.email}
                                </td>
                                <td>{payment.applications?.courses?.name}</td>
                                <td>{payment.amount}</td>
                                <td>
                                    {#if payment.payment_breakdown}
                                        {#each payment.payment_breakdown as mode}
                                            {#if mode.amount > 0}
                                                <span class="badge bg-info text-dark me-1 text-uppercase">{mode.type || mode.mode || 'N/A'}: {mode.amount}</span>
                                            {/if}
                                        {/each}
                                    {:else}
                                        <span class="badge bg-secondary">{payment.transaction_id?.split('-')[0] || 'Unknown'}</span>
                                    {/if}
                                </td>
                                <td>
                                    <span class="badge {payment.status === 'completed' ? 'bg-success' : payment.status === 'pending' ? 'bg-warning' : 'bg-danger'}">
                                        {payment.status}
                                    </span>
                                </td>
                                <td>
                                    <div class="btn-group">
                                        {#if isMetadataLoaded}
                                            {@const studentFormTypeId = formTypesMap.find(ft => ft.name === payment.applications?.form_type)?.id}
                                            {@const template = profileTemplates.find(t => t.target_form_type_id === studentFormTypeId) || 
                                                              profileTemplates.find(t => !t.target_form_type_id) || 
                                                              profileTemplates[0]}
                                            
                                            {#if template}
                                                <a 
                                                    href="/print-profile/{payment.application_id}?templateId={template.id}" 
                                                    target="_blank" 
                                                    class="btn btn-sm btn-outline-info" 
                                                    title="View Student Profile"
                                                >
                                                    <i class="bi bi-person-badge"></i>
                                                </a>
                                            {/if}
                                        {:else}
                                            <button class="btn btn-sm btn-outline-info" disabled>
                                                <span class="spinner-border spinner-border-sm" role="status"></span>
                                            </button>
                                        {/if}
                                        <a href="/fee-collector/payments/edit/{payment.id}" class="btn btn-sm btn-outline-primary" title="Edit Payment">
                                            <i class="bi bi-pencil"></i>
                                        </a>
                                        <button class="btn btn-sm btn-secondary" title="Print" onclick={() => printReceipt(payment)}>
                                            <i class="bi bi-printer"></i>
                                        </button>
                                        <button class="btn btn-sm btn-outline-secondary" title="Download" onclick={() => downloadReceipt(payment)}>
                                            <i class="bi bi-download"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="10" class="text-center text-muted">No payments found.</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>

        {#if data.pagination && data.pagination.totalPages > 1}
            <div class="card-footer bg-white border-0">
                <div class="d-flex justify-content-center align-items-center gap-3 py-2">
                    <button 
                        class="btn btn-sm btn-outline-secondary" 
                        disabled={data.pagination.page <= 1}
                        onclick={() => changePage(data.pagination.page - 1)}
                    >
                        <i class="bi bi-chevron-left"></i> Previous
                    </button>
                    
                    <span class="text-muted">
                        Page <strong>{data.pagination.page}</strong> of {data.pagination.totalPages}
                        <small class="ms-1">({data.pagination.total} total records)</small>
                    </span>

                    <button 
                        class="btn btn-sm btn-outline-secondary" 
                        disabled={data.pagination.page >= data.pagination.totalPages}
                        onclick={() => changePage(data.pagination.page + 1)}
                    >
                        Next <i class="bi bi-chevron-right"></i>
                    </button>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .table-responsive {
        min-height: 400px;
    }
</style>
