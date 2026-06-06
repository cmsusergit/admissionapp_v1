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

    $effect(() => {
        if (form?.message) {
            if (form.error) {
                toastStore.error(form.message);
            } else {
                toastStore.success(form.message);
            }
        }
    });

    // filteredPayments now simply uses the current list provided by the server for this specific tab
    let filteredPayments = $derived(activeTab === 'tuition' ? data.tuitionPayments : 
                     activeTab === 'application' ? data.applicationFeePayments : 
                     data.provisionalFeePayments);

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

        // Map fee_components_breakdown to ReceiptData.feeBreakdown
        const feeBreakdown = (payment.fee_components_breakdown || []).map((section: any) => ({
            name: section.name || section.section,
            items: (section.items || []).map((item: any) => {
                const val = Number(item.amount) || 0;
                // If semester payment, apply 50% to partial items to match displayed total
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
            periodDisplay = 'ACADEMIC YEAR'; // Default for others
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
            semester: periodDisplay, // Add this property
            paymentType: payment.payment_type,
            isProvisional: isProv,
            transactionId: payment.transaction_id,
            amount: Number(payment.amount),
            totalStructureFee: Number(payment.amount), // Fallback
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
            <span class="input-group-text"><i class="bi bi-person-plus"></i></span>
            <input 
                type="text" 
                class="form-control" 
                placeholder="Search Student to Record Payment..." 
                bind:value={studentSearchQuery}
                onfocus={() => showStudentDropdown = true}
            >
            {#if showStudentDropdown && filteredAdmissions.length > 0}
                <div class="list-group position-absolute w-100 shadow-lg z-3 top-100 mt-1" style="max-height: 300px; overflow-y: auto;">
                    {#each filteredAdmissions as adm}
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
                                        {#if data.profileTemplates && data.profileTemplates.length > 0}
                                            {@const studentFormTypeId = data.formTypesMap.find(ft => ft.name === payment.applications?.form_type)?.id}
                                            {@const template = data.profileTemplates.find(t => t.target_form_type_id === studentFormTypeId) || 
                                                              data.profileTemplates.find(t => !t.target_form_type_id) || 
                                                              data.profileTemplates[0]}
                                            
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
                                        {/if}
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
                                <td colspan="9" class="text-center text-muted">No payments found.</td>
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
