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
            goto(`/fee-collector/payments/collect/${admissionIdParam}`);
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
        // Redirect to a student selection flow or just keep the button as a general 'Record' if needed,
        // but typically we want to search for a student first.
        // For now, let's keep the button but change it to 'Search Student to Collect'
        toastStore.info('Search for a student and click their name to record payment.');
    }

    function recordStudentPayment(adm: any) {
        goto(`/fee-collector/payments/collect/${adm.id}`);
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
        <div class="input-group student-autocomplete-container" style="max-width: 400px;">
            <span class="input-group-text"><i class="bi bi-search"></i></span>
            <input 
                type="text" 
                class="form-control" 
                placeholder="Search Student by Name or Adm No..." 
                bind:value={studentSearchQuery}
                on:focus={() => showStudentDropdown = true}
            >
            {#if showStudentDropdown && filteredAdmissions.length > 0}
                <div class="list-group position-absolute w-100 shadow-lg z-3 top-100 mt-1" style="max-height: 300px; overflow-y: auto;">
                    {#each filteredAdmissions as adm}
                        <button 
                            type="button" 
                            class="list-group-item list-group-item-action text-start"
                            on:click={() => recordStudentPayment(adm)}
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

<style>
    .table-responsive {
        min-height: 400px;
    }
</style>
