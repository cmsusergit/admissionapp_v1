<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';
    import { onMount } from 'svelte';
    import { invalidateAll, goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { toastStore } from '$lib/stores/toastStore';
    import { generateReceiptPDF, downloadReceiptPDF, type ReceiptData } from '$lib/utils/pdfGenerator';

    let { data, form } = $props();

    let showRecordModal = $state(false);
    let showReceiptModal = $state(false);
    let searchTerm = $state('');
    let activeTab: 'tuition' | 'application' | 'provisional' = $state('tuition');

    $effect(() => {
        if (form?.message) {
            if (form.error) {
                toastStore.error(form.message);
            } else {
                toastStore.success(form.message);
            }
        }
    });

    let currentList = $derived(activeTab === 'tuition' ? data.tuitionPayments : 
                     activeTab === 'application' ? data.applicationFeePayments : 
                     data.provisionalFeePayments);
    
    let filteredPayments = $derived(currentList.filter(p => {
        const term = searchTerm.toLowerCase();
        const admNo = p.applications?.account_admissions?.[0]?.admission_number?.toLowerCase() || '';
        const name = p.applications?.users?.full_name?.toLowerCase() || '';
        const email = p.applications?.users?.email?.toLowerCase() || '';
        const txId = p.transaction_id?.toLowerCase() || '';
        return admNo.includes(term) || name.includes(term) || email.includes(term) || txId.includes(term);
    }));

    let selectedAdmissionId = $state(''); 
    let feePeriod = $state('year'); // 'year' or 'semester'
    let showSchemeEdit = $state(false); 
    let paymentDate = $state(new Date().toISOString().split('T')[0]);

    let paymentModes = $state([
        { type: 'cash', amount: 0, reference: '' },
        { type: 'online', amount: 0, reference: '' },
        { type: 'cheque', amount: 0, reference: '' },
        { type: 'dd', amount: 0, reference: '' }
    ]);

    let admissionCategoryCode = $state(''); 
    let selectedFeeSchemeId = $state('');
    let lastSetAdmissionId = '';

    let studentSearchQuery = $state('');
    let showStudentDropdown = $state(false);

    // DERIVED VALUES (Replace $effect for pure calculations)
    let selectedAdmission = $derived(data.admissions.find(a => a.id === selectedAdmissionId));
    let actualApplicationId = $derived(selectedAdmission?.application_id || '');
    
    let feeStructureToCollect = $derived(data.feeStructures.find(fs => fs.admissionId === selectedAdmissionId)?.feeStructure || null);
    
    // Calculate first semester amount based on installments or component-wise splitting
    let firstSemAmount = $derived(() => {
        if (!feeStructureToCollect) return 0;
        
        // If installments are explicitly defined, use the first one
        if (feeStructureToCollect.installment_json && feeStructureToCollect.installment_json.length > 0) {
            return Number(feeStructureToCollect.installment_json[0].amount) || 0;
        }
        
        // Use component-wise splitting: 50% if splittable, 100% otherwise
        const components = feeStructureToCollect.fee_components || [];
        let total = 0;
        components.forEach((section: any) => {
            (section.items || []).forEach((item: any) => {
                const val = Number(item.amount) || 0;
                // Use admin configuration 'allow_partial' from builder
                total += item.allow_partial ? (val / 2) : val;
            });
        });
        return total || (feeStructureToCollect.total_fee / 2);
    });

    let amountDue = $derived(feePeriod === 'semester' ? firstSemAmount() : (feeStructureToCollect?.total_fee || 0));

    let totalPaidForStudent = $derived(data.payments.filter(p => 
        p.applications?.id === actualApplicationId && p.status === 'completed'
    ).reduce((sum, p) => sum + (Number(p.amount) || 0), 0));

    let initialRemainingAmount = $derived(amountDue - totalPaidForStudent); 
    let totalAmount = $derived(paymentModes.reduce((sum, mode) => sum + (Number(mode.amount) || 0), 0));
    let currentRemainingAmount = $derived(initialRemainingAmount - totalAmount); 

    let paymentBreakdownJson = $derived(JSON.stringify(paymentModes.filter(m => m.amount > 0).map(m => ({
        mode: m.type,
        amount: Number(m.amount) || 0,
        ref: m.reference
    }))));

    // SIDE EFFECT (Only for resetting UI state when student changes)
    $effect(() => {
        if (selectedAdmissionId && selectedAdmissionId !== lastSetAdmissionId) {
            const adm = data.admissions.find(a => a.id === selectedAdmissionId);
            selectedFeeSchemeId = adm?.applications?.assigned_fee_scheme_id || '';
            lastSetAdmissionId = selectedAdmissionId;
        }
    });

    let filteredAdmissions = $derived(data.admissions.filter(adm => {
        if (!studentSearchQuery) return true;
        const term = studentSearchQuery.toLowerCase();
        const admNo = adm.admission_number?.toLowerCase() || '';
        const name = (adm.applications as any)?.student_user?.full_name?.toLowerCase() || '';
        const email = (adm.applications as any)?.student_user?.email?.toLowerCase() || '';
        return admNo.includes(term) || name.includes(term) || email.includes(term);
    }));

    function selectStudent(adm: any) {
        selectedAdmissionId = adm.id;
        studentSearchQuery = `${adm.admission_number} - ${(adm.applications as any)?.student_user?.full_name || (adm.applications as any)?.student_user?.email}`;
        showStudentDropdown = false;
    }

    function handleWindowClick(event: MouseEvent) {
        const target = event.target as HTMLElement;
        if (!target.closest('.student-autocomplete-container')) {
            showStudentDropdown = false;
        }
    }


    onMount(() => {
        const admissionIdParam = $page.url.searchParams.get('admissionId');
        if (admissionIdParam) {
            const exists = data.admissions.some(a => a.id === admissionIdParam);
            if (exists) {
                openRecordModal();
                selectedAdmissionId = admissionIdParam;
            }
        }
    });

    async function handleUpdateScheme() {
        if (!actualApplicationId || !selectedFeeSchemeId) {
            toastStore.error('Application ID and Fee Scheme are required.');
            return;
        }

        startLoading();
        try {
            const formData = new FormData();
            formData.append('application_id', actualApplicationId);
            formData.append('fee_scheme_id', selectedFeeSchemeId);

            const response = await fetch('?/updateAssignedScheme', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Server returned error ' + response.status);
            }

            await invalidateAll();
            
            // After refresh, force re-sync from database if needed, 
            // but the reactive block should handle it since selectedAdmissionId remains same.
            lastSetAdmissionId = ''; // Force sync on next reactive cycle
            
            showSchemeEdit = false;
            toastStore.success('Fee scheme updated successfully!');
        } catch (e) {
            console.error('Update failed:', e);
            toastStore.error('Failed to update fee scheme.');
        } finally {
            stopLoading();
        }
    }

    function openRecordModal() {
        selectedAdmissionId = ''; 
        studentSearchQuery = '';
        showStudentDropdown = false;
        admissionCategoryCode = '';
        paymentModes = [
            { type: 'cash', amount: 0, reference: '' },
            { type: 'online', amount: 0, reference: '' },
            { type: 'cheque', amount: 0, reference: '' },
            { type: 'dd', amount: 0, reference: '' }
        ];
        paymentDate = new Date().toISOString().split('T')[0];
        showRecordModal = true;
    }

    function getFeeBreakdown(payment: any): any[] | null {
        if (payment.fee_components_breakdown && payment.fee_components_breakdown.length > 0) {
            return payment.fee_components_breakdown;
        }
        const app = payment.applications;
        if (app && data.allFeeStructures) {
            const admission = data.admissions.find(a => a.application_id === payment.application_id);
            if (admission) {
                const fsWrapper = data.feeStructures.find(fs => fs.admissionId === admission.id);
                if (fsWrapper?.feeStructure?.fee_components) {
                    return fsWrapper.feeStructure.fee_components;
                }
            }
        }
        return null;
    }

    async function downloadReceipt(payment: any) {
        console.log('[DownloadReceipt] Button clicked for payment:', payment.id);
        toastStore.info('Preparing receipt PDF for download...');
        
        try {
            const receiptData = prepareReceiptData(payment);
            if (!receiptData) return;

            console.log('[DownloadReceipt] Downloading PDF with data:', receiptData);
            await downloadReceiptPDF(receiptData);
            toastStore.success('PDF download started');
        } catch (err) {
            console.error('[DownloadReceipt] Error:', err);
            toastStore.error('Failed to download: ' + (err instanceof Error ? err.message : String(err)));
        }
    }

    function prepareReceiptData(payment: any): ReceiptData | null {
        if (!payment) {
            toastStore.error('No payment data provided.');
            return null;
        }

        const app = payment.applications || {};
        const student = app.student_user || {};
        const profiles = student.student_profiles;
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        const course = app.courses || {};
        const colleges = course.colleges;
        const college = Array.isArray(colleges) ? colleges[0] : colleges;
        const universities = college?.universities;
        const university = Array.isArray(universities) ? universities[0] : universities;
        
        const branch = app.branches || {};
        const cycle = app.admission_cycles || {};
        const academicYear = cycle.academic_years?.name || 'N/A';
        const feePeriod = payment.fee_period || 'year';
        const isTuitionFee = payment.payment_type === 'tuition_fee';

        const accAdmissions = app.account_admissions;
        const admissionNo = Array.isArray(accAdmissions) 
            ? accAdmissions[0]?.admission_number 
            : accAdmissions?.admission_number;
        
        let feeBreakdown = getFeeBreakdown(payment);
        let totalStructureFee = 0;
        
        if (feeBreakdown && Array.isArray(feeBreakdown)) {
            // Apply component-wise splitting for semester receipts ONLY for tuition fees
            if (feePeriod === 'semester' && isTuitionFee) {
                feeBreakdown = feeBreakdown.map(section => ({
                    ...section,
                    items: (section.items || []).map(item => {
                        const fullVal = Number(item.amount) || 0;
                        // Use admin configuration 'allow_partial'
                        return { 
                            ...item, 
                            amount: item.allow_partial ? (fullVal / 2) : fullVal 
                        };
                    })
                }));
            }

            totalStructureFee = feeBreakdown.reduce((sum: number, section: any) => {
                const items = section.items || [];
                return sum + items.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
            }, 0);
        }

        let paymentModes = payment.payment_breakdown?.map((m: any) => ({
            mode: m.type || m.mode,
            amount: Number(m.amount) || 0,
            ref: m.reference || m.ref
        }));

        if (!paymentModes || paymentModes.length === 0) {
            paymentModes = [{
                mode: payment.payment_mode || 'Unknown',
                amount: Number(payment.amount) || 0,
                ref: payment.reference_no
            }];
        }

        return {
            receiptNumber: payment.receipt_number || payment.transaction_id || 'PENDING',
            date: payment.payment_date,
            studentName: student.full_name || 'N/A',
            email: student.email || 'N/A',
            enrollmentNumber: profile?.enrollment_number,
            admissionNumber: admissionNo,
            courseName: course.name || 'N/A',
            branchName: branch.name || 'N/A',
            academicYear: academicYear,
            semester: isTuitionFee 
                ? (feePeriod === 'semester' ? 'SEMESTER' : 'YEAR') 
                : 'FIRST SEMESTER', // Default for other fee types
            paymentType: payment.payment_type || 'fee',
            isProvisional: payment.payment_type === 'provisional_fee',
            transactionId: payment.transaction_id,
            amount: Number(payment.amount) || 0,
            totalStructureFee,
            feeBreakdown,
            paymentModes,
            university: {
                name: college?.name || university?.name || 'College Name',
                address: college?.address || university?.address,
                contactEmail: university?.contact_email,
                logoUrl: college?.logo_url || university?.logo_url
            }
        };
    }

    async function printReceipt(payment: any) {
        console.log('[PrintReceipt] Button clicked for payment:', payment.id);
        toastStore.info('Preparing receipt PDF...');
        
        try {
            const receiptData = prepareReceiptData(payment);
            if (!receiptData) return;

            console.log('[PrintReceipt] Generating PDF with data:', receiptData);
            await generateReceiptPDF(receiptData);
            toastStore.success('PDF sent to printer');
        } catch (err) {
            console.error('[PrintReceipt] Error in function:', err);
            toastStore.error('Failed to generate receipt: ' + (err instanceof Error ? err.message : String(err)));
        }
    }
</script>

<svelte:window on:click={handleWindowClick} />

<div class="container-fluid">
    <h1 class="mb-4">Payment History</h1>

    <ul class="nav nav-tabs mb-4">
        <li class="nav-item">
            <a class="nav-link {activeTab === 'tuition' ? 'active' : ''}" href="#" on:click|preventDefault={() => activeTab = 'tuition'}>
                Tuition / Admission Fees
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link {activeTab === 'application' ? 'active' : ''}" href="#" on:click|preventDefault={() => activeTab = 'application'}>
                Application Form Fees
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link {activeTab === 'provisional' ? 'active' : ''}" href="#" on:click|preventDefault={() => activeTab = 'provisional'}>
                Provisional Fees
            </a>
        </li>
    </ul>

    <div class="d-flex justify-content-between align-items-center mb-3">
        <div class="input-group" style="max-width: 300px;">
            <input type="text" class="form-control" placeholder="Search..." bind:value={searchTerm}>
            <span class="input-group-text"><i class="bi bi-search"></i></span>
        </div>
        {#if activeTab === 'tuition'}
            <button class="btn btn-primary" on:click={openRecordModal}>Record New Admission Payment</button>
        {/if}
    </div>

    <div class="card">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                        <tr>
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
                        {#each filteredPayments as payment}
                            <tr>
                                <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                                <td>{Array.isArray(payment.applications?.account_admissions) ? payment.applications?.account_admissions[0]?.admission_number : payment.applications?.account_admissions?.admission_number || '-'}</td>
                                <td>
                                    <span class="badge {payment.applications?.student_user?.student_profiles?.enrollment_number ? 'bg-success' : 'bg-light text-muted border'}">
                                        {payment.applications?.student_user?.student_profiles?.enrollment_number || 'Pending'}
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
                                        <button class="btn btn-sm btn-secondary" title="Print" on:click={() => printReceipt(payment)}>
                                            <i class="bi bi-printer"></i>
                                        </button>
                                        <button class="btn btn-sm btn-outline-secondary" title="Download" on:click={() => downloadReceipt(payment)}>
                                            <i class="bi bi-download"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="9" class="text-center text-muted">No payments found.</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<!-- Record Payment Modal -->
<div class="modal" tabindex="-1" style="display: {showRecordModal ? 'block' : 'none'};">
    <div class="modal-dialog modal-xl">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Record Admission Payment</h5>
                <button type="button" class="btn-close" on:click={() => (showRecordModal = false)}></button>
            </div>
            <form method="POST" action="?/recordPayment" use:enhance={() => { 
                startLoading();
                return async ({ result, update }) => {
                    if (result.type === 'success') {
                        showRecordModal = false;
                        selectedAdmissionId = '';
                        studentSearchQuery = '';
                        admissionCategoryCode = '';
                        feePeriod = 'year';
                    }
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <div class="row">
                        <!-- Left Column: Summary & Info -->
                        <div class="col-md-5 border-end bg-light p-4">
                            <h6 class="text-uppercase fw-bold text-muted mb-3">Student & Fee Summary</h6>
                            
                            {#if selectedAdmissionId}
                                {@const selectedAdm = data.admissions.find(a => a.id === selectedAdmissionId)}
                                <div class="card mb-3 shadow-sm border-0">
                                    <div class="card-body">
                                        <div class="d-flex align-items-center mb-2">
                                            <div class="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-3" style="width: 50px; height: 50px;">
                                                <i class="bi bi-person fs-3"></i>
                                            </div>
                                            <div>
                                                <h6 class="mb-0 fw-bold">{selectedAdm?.applications?.student_user?.full_name}</h6>
                                                <small class="text-muted">{selectedAdm?.admission_number || 'N/A'}</small>
                                            </div>
                                        </div>
                                        <div class="mt-2">
                                            <span class="badge bg-outline-primary border text-primary me-1">{selectedAdm?.applications?.courses?.name}</span>
                                            <span class="badge bg-outline-info border text-info">{selectedAdm?.applications?.branches?.name || 'All Branches'}</span>
                                        </div>
                                    </div>
                                </div>

                                {#if feeStructureToCollect}
                                    <div class="card mb-3 shadow-sm border-0">
                                        <div class="card-header bg-white border-0 py-3">
                                            <h6 class="mb-0 fw-bold">Fee Breakdown ({feePeriod === 'semester' ? 'SEMESTER' : 'YEARLY'})</h6>
                                        </div>
                                        <div class="card-body p-0">
                                            <div class="table-responsive">
                                                <table class="table table-sm table-borderless mb-0">
                                                    <thead class="bg-light">
                                                        <tr>
                                                            <th class="ps-3">Item</th>
                                                            <th class="text-end pe-3">Amount</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {#each feeStructureToCollect.fee_components || [] as section}
                                                            {#each section.items || [] as item}
                                                                {@const val = Number(item.amount) || 0}
                                                                {@const displayAmt = (feePeriod === 'semester' && item.allow_partial) ? (val / 2) : val}
                                                                <tr>
                                                                    <td class="ps-3 py-2 text-muted">{item.name}</td>
                                                                    <td class="text-end pe-3 py-2 fw-medium">INR {displayAmt.toLocaleString()}</td>
                                                                </tr>
                                                            {/each}
                                                        {/each}
                                                    </tbody>
                                                    <tfoot class="border-top">
                                                        <tr class="table-primary">
                                                            <th class="ps-3 py-2">Total Due</th>
                                                            <th class="text-end pe-3 py-2">INR {amountDue.toLocaleString()}</th>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="mt-4">
                                        <div class="d-flex justify-content-between mb-1">
                                            <small class="text-muted">Payment Progress</small>
                                            <small class="fw-bold">{((totalPaidForStudent / amountDue) * 100).toFixed(0)}%</small>
                                        </div>
                                        <div class="progress mb-3" style="height: 10px;">
                                            <div class="progress-bar bg-success" role="progressbar" style="width: {(totalPaidForStudent / amountDue) * 100}%"></div>
                                        </div>

                                        <div class="alert alert-warning py-2 mb-2">
                                            <div class="d-flex justify-content-between">
                                                <span>Previously Paid:</span>
                                                <span class="fw-bold">INR {totalPaidForStudent.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div class="alert alert-info py-2 mb-2">
                                            <div class="d-flex justify-content-between">
                                                <span>Remaining Due:</span>
                                                <span class="fw-bold">INR {initialRemainingAmount.toLocaleString()}</span>
                                            </div>
                                        </div>
                                        <div class="alert {currentRemainingAmount <= 0 ? 'alert-success' : 'alert-danger'} py-2 mb-0">
                                            <div class="d-flex justify-content-between">
                                                <span>After This Payment:</span>
                                                <span class="fw-bold">INR {currentRemainingAmount.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                {:else}
                                    <div class="alert alert-warning">Please assign a fee scheme to see the breakdown.</div>
                                {/if}
                            {:else}
                                <div class="text-center py-5">
                                    <i class="bi bi-person-search display-1 text-light"></i>
                                    <p class="text-muted">Select a student to view details and fee breakdown</p>
                                </div>
                            {/if}
                        </div>

                        <!-- Right Column: Form Inputs -->
                        <div class="col-md-7 p-4">
                            <div class="mb-4">
                                <label for="student-search" class="form-label fw-bold">1. Select Student</label>
                                <div class="input-group position-relative student-autocomplete-container shadow-sm">
                                    <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
                                    <input 
                                        type="text" 
                                        class="form-control" 
                                        id="student-search"
                                        placeholder="Type Admission No. or Name..."
                                        bind:value={studentSearchQuery}
                                        on:focus={() => showStudentDropdown = true}
                                        required
                                    />
                                    {#if selectedAdmissionId}
                                        <button type="button" class="btn btn-outline-secondary" on:click={() => { selectedAdmissionId = ''; studentSearchQuery = ''; }}>
                                            <i class="bi bi-x-lg"></i>
                                        </button>
                                    {/if}
                                    
                                    {#if showStudentDropdown && filteredAdmissions.length > 0}
                                        <div class="list-group position-absolute w-100 shadow-lg z-3 top-100 mt-1" style="max-height: 200px; overflow-y: auto;">
                                            {#each filteredAdmissions as adm}
                                                {@const admAny = adm as any}
                                                <button 
                                                    type="button" 
                                                    class="list-group-item list-group-item-action text-start"
                                                    on:click={() => selectStudent(adm)}
                                                >
                                                    <div class="fw-bold">{admAny.admission_number}</div>
                                                    <small class="text-muted">{admAny.applications?.student_user?.full_name}</small>
                                                </button>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                                <input type="hidden" name="application_id" value={actualApplicationId} />
                            </div>

                            {#if selectedAdmissionId}
                                <div class="row mb-4">
                                    <div class="col-md-6">
                                        <label for="adm-category" class="form-label fw-bold">2. Category Code</label>
                                        <input type="text" class="form-control" id="adm-category" name="admission_category_code" bind:value={admissionCategoryCode} placeholder="e.g. V, F, M" required />
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label fw-bold">3. Fee Period</label>
                                        <div class="btn-group w-100" role="group">
                                            <input type="radio" class="btn-check" name="fee_period_ui" id="period-year" value="year" bind:group={feePeriod}>
                                            <label class="btn btn-outline-primary" for="period-year">YEAR</label>
                                            <input type="radio" class="btn-check" name="fee_period_ui" id="period-sem" value="semester" bind:group={feePeriod}>
                                            <label class="btn btn-outline-primary" for="period-sem">SEMESTER</label>
                                        </div>
                                        <input type="hidden" name="fee_period" value={feePeriod} />
                                    </div>
                                </div>

                                <div class="mb-4">
                                    <label class="form-label fw-bold">4. Payment Modes (Hybrid Possible)</label>
                                    <div class="card border-0 shadow-sm overflow-hidden">
                                        <table class="table table-hover mb-0">
                                            <thead class="bg-light">
                                                <tr>
                                                    <th class="ps-3">Mode</th>
                                                    <th width="140">Amount</th>
                                                    <th class="pe-3">Reference / Txn ID</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {#each paymentModes as mode}
                                                    <tr>
                                                        <td class="ps-3 pt-3 text-capitalize fw-medium">{mode.type}</td>
                                                        <td>
                                                            <input type="number" class="form-control form-control-sm" bind:value={mode.amount} min="0" placeholder="0.00">
                                                        </td>
                                                        <td class="pe-3">
                                                            <input type="text" class="form-control form-control-sm" bind:value={mode.reference} placeholder="Ref No." disabled={mode.amount <= 0}>
                                                        </td>
                                                    </tr>
                                                {/each}
                                            </tbody>
                                            <tfoot class="bg-light-primary">
                                                <tr>
                                                    <th class="ps-3 py-3">Collecting Now</th>
                                                    <th class="py-3 fs-5 text-primary">INR {totalAmount.toLocaleString()}</th>
                                                    <th></th>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                    <input type="hidden" name="payment_breakdown" value={paymentBreakdownJson} />
                                    <input type="hidden" name="amount" value={totalAmount} />
                                </div>

                                <div class="row">
                                    <div class="col-md-6">
                                        <label for="payment-date" class="form-label fw-bold">5. Payment Date</label>
                                        <input type="date" class="form-control" id="payment-date" name="payment_date" bind:value={paymentDate} required disabled={initialRemainingAmount <= 0} />
                                    </div>
                                    <div class="col-md-6 d-flex align-items-end">
                                        {#if initialRemainingAmount <= 0}
                                            <div class="badge bg-success py-3 w-100 fs-6">
                                                <i class="bi bi-check-circle-fill me-2"></i>FULLY PAID
                                            </div>
                                        {/if}
                                    </div>
                                </div>

                                {#if showSchemeEdit}
                                    <div class="card mt-4 bg-light border-0 shadow-sm">
                                        <div class="card-body">
                                            <label class="form-label fw-bold">Change Assigned Fee Scheme</label>
                                            <div class="input-group">
                                                <select class="form-select" bind:value={selectedFeeSchemeId} required>
                                                    <option value="">-- Assign Scheme --</option>
                                                    {#each data.feeSchemes as scheme}
                                                        <option value={scheme.id}>{scheme.name}</option>
                                                    {/each}
                                                </select>
                                                <button type="button" class="btn btn-success" on:click={handleUpdateScheme}>Update</button>
                                            </div>
                                        </div>
                                    </div>
                                {/if}
                            {/if}
                        </div>
                    </div>
                </div>
                <div class="modal-footer bg-light border-0 py-3">
                    <button type="button" class="btn btn-outline-secondary px-4" on:click={() => (showRecordModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-primary px-5 fw-bold" disabled={totalAmount <= 0 || initialRemainingAmount <= 0}>
                        <i class="bi bi-check2-circle me-2"></i>Record Payment
                    </button>
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
