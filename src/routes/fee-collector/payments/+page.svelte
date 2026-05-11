<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';
    import { onMount } from 'svelte';
    import { invalidateAll, goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { toastStore } from '$lib/stores/toastStore';
    import { generateReceiptPDF, type ReceiptData } from '$lib/utils/pdfGenerator';

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
    let amountDue = $derived(feeStructureToCollect?.total_fee || 0);

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

    function printReceipt(payment: any) {
        console.log('[PrintReceipt] Button clicked for payment:', payment.id);
        if (!payment) {
            toastStore.error('No payment data provided.');
            return;
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
        
        const accAdmissions = app.account_admissions;
        const admissionNo = Array.isArray(accAdmissions) 
            ? accAdmissions[0]?.admission_number 
            : accAdmissions?.admission_number;
        
        let feeBreakdown = getFeeBreakdown(payment);
        let totalStructureFee = 0;
        if (feeBreakdown && Array.isArray(feeBreakdown)) {
            totalStructureFee = feeBreakdown.reduce((sum: number, section: any) => {
                const items = section.items || [];
                return sum + items.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
            }, 0);
        }

        // Handle hybrid/legacy payment modes
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

        const receiptData: ReceiptData = {
            receiptNumber: payment.receipt_number || payment.transaction_id || 'PENDING',
            date: payment.payment_date,
            studentName: student.full_name || 'N/A',
            email: student.email || 'N/A',
            enrollmentNumber: profile?.enrollment_number,
            admissionNumber: admissionNo,
            courseName: course.name || 'N/A',
            paymentType: payment.payment_type || 'fee',
            isProvisional: payment.payment_type === 'provisional_fee',
            transactionId: payment.transaction_id,
            amount: Number(payment.amount) || 0,
            totalStructureFee,
            feeBreakdown,
            paymentModes,
            university: {
                name: university?.name || college?.name || 'University Name',
                address: university?.address || college?.address,
                contactEmail: university?.contact_email,
                logoUrl: university?.logo_url || college?.logo_url
            }
        };

        try {
            console.log('Generating PDF with data:', receiptData);
            generateReceiptPDF(receiptData);
        } catch (err) {
            console.error('Error generating PDF:', err);
            toastStore.error('Failed to generate receipt PDF. See console for details.');
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
                                                <span class="badge bg-info text-dark me-1">{mode.type}: {mode.amount}</span>
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
                                    <button class="btn btn-sm btn-secondary" on:click={() => printReceipt(payment)}>
                                        <i class="bi bi-printer"></i> Print
                                    </button>
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
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Record Payment</h5>
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
                    }
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <div class="mb-3 position-relative student-autocomplete-container">
                        <label for="student-search" class="form-label">Select Student (Admission No.)</label>
                        <div class="input-group">
                            <span class="input-group-text"><i class="bi bi-search"></i></span>
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
                        </div>
                        
                        {#if showStudentDropdown && filteredAdmissions.length > 0}
                            <div class="list-group position-absolute w-100 shadow-sm z-3" style="max-height: 200px; overflow-y: auto;">
                                {#each filteredAdmissions as adm}
                                    {@const admAny = adm as any}
                                    <button 
                                        type="button" 
                                        class="list-group-item list-group-item-action text-start"
                                        on:click={() => selectStudent(adm)}
                                    >
                                        <div class="fw-bold">{admAny.admission_number}</div>
                                        <small class="text-muted">{admAny.applications?.student_user?.full_name || admAny.applications?.student_user?.email}</small>
                                    </button>
                                {/each}
                            </div>
                        {:else if showStudentDropdown && studentSearchQuery}
                            <div class="list-group position-absolute w-100 shadow-sm z-3">
                                <div class="list-group-item disabled">No non-provisional students found matching "{studentSearchQuery}"</div>
                            </div>
                        {/if}
                        
                        <input type="hidden" name="application_id" value={actualApplicationId} />
                        <div class="form-text">Only showing students with non-provisional admissions.</div>
                    </div>

                    {#if selectedAdmissionId}
                        {@const selectedAdm = data.admissions.find(a => a.id === selectedAdmissionId)}
                        <div class="card bg-light mb-3">
                            <div class="card-body p-3">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div>
                                        <label class="form-label fw-bold mb-0">Assigned Fee Scheme:</label>
                                        {#if selectedAdm?.applications?.assigned_fee_scheme_id}
                                            <span class="badge bg-primary fs-6 ms-2">
                                                {data.feeSchemes.find(s => s.id === selectedAdm?.applications?.assigned_fee_scheme_id)?.name}
                                            </span>
                                        {:else}
                                            <span class="badge bg-warning text-dark fs-6 ms-2">Not Assigned</span>
                                        {/if}
                                    </div>
                                    <button type="button" class="btn btn-sm btn-outline-primary" on:click={() => showSchemeEdit = !showSchemeEdit}>
                                        {showSchemeEdit ? 'Cancel' : 'Change Scheme'}
                                    </button>
                                </div>

                                {#if showSchemeEdit || !selectedAdm?.applications?.assigned_fee_scheme_id}
                                    <div class="mt-3 p-2 border rounded bg-white">
                                        <div class="input-group">
                                            <select class="form-select form-select-sm" bind:value={selectedFeeSchemeId} required>
                                                <option value="">-- Assign Scheme --</option>
                                                {#each data.feeSchemes as scheme}
                                                    <option value={scheme.id}>
                                                        {scheme.name}
                                                    </option>
                                                {/each}
                                            </select>
                                            <button type="button" class="btn btn-sm btn-success" on:click={handleUpdateScheme}>
                                                Update Scheme
                                            </button>
                                        </div>
                                        <div class="form-text mt-1 text-info">Changing the scheme will update the "Total Fee Due" below.</div>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {/if}

                    <div class="mb-3">
                        <label for="adm-category" class="form-label">Admission Category Code (e.g., V, F)</label>
                        <input type="text" class="form-control" id="adm-category" name="admission_category_code" bind:value={admissionCategoryCode} placeholder="e.g. V, F, M" required />
                        <div class="form-text">Code for ID generation (e.g., V for Vacant, F for Free, M for Management)</div>
                    </div>

                    {#if feeStructureToCollect}
                        <div class="alert alert-info d-flex justify-content-between align-items-center">
                            <span>**Total Fee Due:**</span>
                            <span class="fw-bold fs-5">INR {feeStructureToCollect.total_fee.toFixed(2)}</span>
                        </div>
                        {#if feeStructureToCollect.installment_json && feeStructureToCollect.installment_json.length > 0}
                            <h6 class="border-bottom pb-2 mb-2">Installment Breakdown</h6>
                            <ul class="list-group mb-3">
                                {#each feeStructureToCollect.installment_json as installment}
                                    <li class="list-group-item d-flex justify-content-between align-items-center">
                                        {installment.name} ({new Date(installment.due_date).toLocaleDateString()})
                                        <span class="badge bg-primary rounded-pill">INR {Number(installment.amount).toFixed(2)}</span>
                                    </li>
                                {/each}
                            </ul>
                        {/if}

                        <div class="mb-3">
                            <div class="alert alert-success d-flex justify-content-between align-items-center mb-1">
                                <span>**Previously Paid:**</span>
                                <span class="fw-bold fs-5">INR {totalPaidForStudent.toFixed(2)}</span>
                            </div>
                            <div class="alert alert-warning d-flex justify-content-between align-items-center mb-1">
                                <span>**Initial Remaining Due:**</span>
                                <span class="fw-bold fs-5">INR {initialRemainingAmount.toFixed(2)}</span>
                            </div>
                            <div class="alert {currentRemainingAmount >= 0 ? 'alert-danger' : 'alert-success'} d-flex justify-content-between align-items-center">
                                <span>**Remaining After Current Payment:**</span>
                                <span class="fw-bold fs-5">INR {currentRemainingAmount.toFixed(2)}</span>
                            </div>
                        </div>
                    {:else if selectedAdmissionId}
                        <div class="alert alert-warning">No fee structure defined for this student's course/year.</div>
                    {/if}
                    
                    <div class="mb-3">
                        <label class="form-label fw-bold">Payment Breakdown (Hybrid Mode)</label>
                        <div class="table-responsive border rounded p-2 bg-light">
                            <table class="table table-sm mb-0">
                                <thead>
                                    <tr>
                                        <th>Mode</th>
                                        <th width="150">Amount</th>
                                        <th>Reference / Txn ID</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {#each paymentModes as mode}
                                        <tr>
                                            <td class="text-capitalize pt-2 fw-bold">{mode.type}</td>
                                            <td>
                                                <input type="number" class="form-control form-control-sm" bind:value={mode.amount} min="0" placeholder="0.00">
                                            </td>
                                            <td>
                                                <input type="text" class="form-control form-control-sm" bind:value={mode.reference} placeholder="Ref No." disabled={mode.amount <= 0}>
                                            </td>
                                        </tr>
                                    {/each}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <th class="text-end">Total Paid:</th>
                                        <th>{totalAmount.toFixed(2)}</th>
                                        <th></th>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        <input type="hidden" name="payment_breakdown" value={paymentBreakdownJson} />
                        <input type="hidden" name="amount" value={totalAmount} />
                    </div>

                    <div class="mb-3">
                        <label for="payment-date" class="form-label">Payment Date</label>
                        <input type="date" class="form-control" id="payment-date" name="payment_date" bind:value={paymentDate} required disabled={initialRemainingAmount <= 0} />
                    </div>
                    
                    {#if initialRemainingAmount <= 0 && feeStructureToCollect}
                        <div class="alert alert-danger mt-3">
                            <i class="bi bi-exclamation-triangle-fill me-2"></i>
                            This student has already fully paid the tuition fees based on the assigned scheme. Further payments are not permitted unless reset by an administrator.
                        </div>
                    {/if}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showRecordModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-primary" disabled={totalAmount <= 0 || initialRemainingAmount <= 0}>Record Payment</button>
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
