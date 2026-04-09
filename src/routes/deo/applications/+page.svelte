<script lang="ts">
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';
    import { enhance } from '$app/forms';
    import { toastStore } from '$lib/stores/toastStore';
    import { supabase } from '$lib/supabase';

    export let data: PageData;

    let filterCourseId = $page.url.searchParams.get('courseId') || '';
    let filterCycleId = $page.url.searchParams.get('cycleId') || '';
    let filterStatus = $page.url.searchParams.get('status') || '';
    let filterSearch = $page.url.searchParams.get('search') || '';
    let filterCreatedBy = $page.url.searchParams.get('createdBy') || '';
    let filterUpdatedBy = $page.url.searchParams.get('updatedBy') || '';

    // Pagination variables
    $: currentPage = data.page;
    $: currentLimit = data.limit;
    $: totalItems = data.totalCount;
    $: totalPages = Math.ceil(totalItems / currentLimit);

    function applyFilters() {
        const query = new URLSearchParams();
        if (filterCourseId) query.set('courseId', filterCourseId);
        if (filterCycleId) query.set('cycleId', filterCycleId);
        if (filterStatus) query.set('status', filterStatus);
        if (filterSearch) query.set('search', filterSearch);
        if (filterCreatedBy) query.set('createdBy', filterCreatedBy);
        if (filterUpdatedBy) query.set('updatedBy', filterUpdatedBy);
        query.set('page', '1'); // Reset to first page when filters apply
        goto(`?${query.toString()}`);
    }

    function getDisplayName(app: any) {
        // First try full_name from users table
        if (app.users?.full_name) {
            return app.users.full_name;
        }
        
        // If not available, try to combine from form_data
        const formData = app.form_data || {};
        const firstName = formData.firstname || formData.first_name || '';
        const middleName = formData.middlename || formData.middle_name || '';
        const lastName = formData.lastname || formData.last_name || '';
        
        const combined = [firstName, middleName, lastName].filter(n => n).join(' ');
        return combined || 'N/A';
    }

    function clearFilters() {
        filterCourseId = '';
        filterCycleId = '';
        filterStatus = '';
        filterSearch = '';
        filterCreatedBy = '';
        filterUpdatedBy = '';
        goto('?');
    }

    function searchByStudent(app: any) {
        const studentName = getDisplayName(app);
        filterSearch = studentName;
        applyFilters();
    }

    function handleSearchKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            applyFilters();
        }
    }

    function gotoPage(newPage: number) {
        if (newPage >= 1 && newPage <= totalPages) {
            const query = new URLSearchParams($page.url.searchParams); // Preserve existing params
            query.set('page', newPage.toString());
            goto(`?${query.toString()}`);
        }
    }

    // --- Provisional Fee Logic ---
    let showPaymentModal = false;
    let currentApp: any = null;
    let paymentDetails = {
        amount: 0,
        mode: 'qr',
        reference: '',
        qrCodeUrl: ''
    };
    let isSubmittingPayment = false;

    function isProvisional(app: any) {
        // data.formTypesMap is passed from server
        return !!data.formTypesMap[app.form_type];
    }

    function isPaid(app: any) {
        if (!app.payments) return false;
        return app.payments.some((p: any) => p.payment_type === 'provisional_fee' && p.status === 'completed');
    }

    async function openPaymentModal(app: any) {
        currentApp = app;
        paymentDetails = { amount: 0, mode: 'qr', reference: '', qrCodeUrl: '' };
        
        const cId = app.courses?.id || app.course_id;
        const cyId = app.admission_cycles?.id || app.cycle_id;
         
        console.log(`Fetching fee for Course: ${cId}, Cycle: ${cyId}, Type: ${app.form_type}`);

        // Fetch fee and QR code
        const { data: form, error } = await supabase
            .from('admission_forms')
            .select('prov_fee, qr_code_url')
            .eq('course_id', cId)
            .eq('cycle_id', cyId)
            .eq('form_type', app.form_type)
            .maybeSingle();
        
        console.log('Fee Query Result:', { form, error });

        if (error) {
            console.error('Error fetching fee:', error);
            toastStore.error('Could not fetch fee details.');
            return;
        }

        if (!form) {
            console.warn('No admission form found for fee lookup.');
            // Fallback or just show 0
        }

        paymentDetails.amount = form?.prov_fee || 0;
        paymentDetails.qrCodeUrl = form?.qr_code_url || '';
        console.log('Set Payment Amount:', paymentDetails.amount, 'QR Code:', paymentDetails.qrCodeUrl);
        showPaymentModal = true;
    }

    function closePaymentModal() {
        showPaymentModal = false;
        currentApp = null;
    }

    function printReceipt(app: any) {
        if (!app.payments) return;
        // Find the provisional fee payment
        const payment = app.payments.find((p: any) => p.payment_type === 'provisional_fee' && p.status === 'completed');
        
        if (payment) {
            window.open(`/receipts/print?payment_id=${payment.id}`, '_blank');
        } else {
            toastStore.error('No completed provisional payment found.');
        }
    }

    function printUndertaking(app: any) {
        window.open(`/deo/undertaking/${app.id}`, '_blank');
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">My Applications (DEO)</h1>

    <!-- Filters -->
    <div class="card mb-4">
        <div class="card-header">Filter Applications</div>
        <div class="card-body">
            <div class="row g-3 align-items-end">
                <div class="col-md-3">
                    <label class="form-label">Course</label>
                    <select class="form-select" bind:value={filterCourseId}>
                        <option value="">All Courses</option>
                        {#each data.courses as course}
                            <option value={course.id}>{course.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Admission Cycle</label>
                    <select class="form-select" bind:value={filterCycleId}>
                        <option value="">All Cycles</option>
                        {#each data.cycles as cycle}
                            <option value={cycle.id}>{cycle.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label">Status</label>
                    <select class="form-select" bind:value={filterStatus}>
                        <option value="">All Statuses</option>
                        <option value="draft">Draft</option>
                        <option value="submitted">Submitted</option>
                        <option value="verified">Verified</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="waitlisted">Waitlisted</option>
                        <option value="needs_correction">Needs Correction</option>
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label">Created By</label>
                    <select class="form-select" bind:value={filterCreatedBy}>
                        <option value="">Any</option>
                        <option value="student">Student (Self)</option>
                        <optgroup label="Staff">
                            {#each data.staffUsers as staff}
                                <option value={staff.id}>{staff.full_name}</option>
                            {/each}
                        </optgroup>
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label">Updated By</label>
                    <select class="form-select" bind:value={filterUpdatedBy}>
                        <option value="">Any</option>
                        <option value="student">Student (Self)</option>
                        <optgroup label="Staff">
                            {#each data.staffUsers as staff}
                                <option value={staff.id}>{staff.full_name}</option>
                            {/each}
                        </optgroup>
                    </select>
                </div>
                <div class="col-md-3">
                    <label class="form-label">Search</label>
                    <input type="text" class="form-control" placeholder="Name, Email, or Enrollment ID (press Enter)" bind:value={filterSearch} on:keydown={handleSearchKeydown}>
                </div>
                <div class="col-md-2">
                    <div class="d-flex gap-2">
                        <button class="btn btn-primary flex-grow-1" on:click={applyFilters}>Apply</button>
                        <button class="btn btn-outline-secondary" on:click={clearFilters}>Clear</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Applications Table -->
    <div class="card">
        <div class="card-header d-flex justify-content-between align-items-center">
            <span>Applications List</span>
            <span class="badge bg-secondary">{totalItems} Found</span>
        </div>
        <div class="card-body">
            {#if data.applications.length > 0}
                <div class="table-responsive">
                    <table class="table table-striped table-hover align-middle">
                        <thead>
                            <tr>
                                <th>Student <small class="text-muted">(click to search)</small></th>
                                <th>Course & Cycle</th>
                                <th>Status</th>
                                <th>Created By</th>
                                <th>Last Updated</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.applications as app}
                                {@const appAny = app as any}
                                <tr>
                                    <td>
                                        <button class="btn btn-link p-0 text-start text-decoration-none" on:click={() => searchByStudent(appAny)} style="cursor: pointer;">
                                            {getDisplayName(appAny)}
                                        </button>
                                        {#if appAny.users?.student_profiles?.enrollment_number}
                                            <br/><small class="text-muted">ID: {appAny.users.student_profiles.enrollment_number}</small>
                                        {/if}
                                        <br/>
                                        <small class="text-muted">{appAny.users?.email}</small>
                                    </td>
                                    <td>
                                        {appAny.courses?.name}
                                        {#if appAny.branches?.name} <span class="badge bg-light text-dark border ms-1">{appAny.branches.name}</span> {/if}
                                        <br/>
                                        <small class="text-muted">{appAny.admission_cycles?.name}</small>
                                    </td>
                                    <td>
                                        <span class="badge 
                                            {appAny.status === 'approved' ? 'bg-success' : 
                                            appAny.status === 'rejected' ? 'bg-danger' : 
                                            appAny.status === 'verified' ? 'bg-primary' : 
                                            appAny.status === 'submitted' ? 'bg-info' : 'bg-warning text-dark'}">
                                            {appAny.status}
                                        </span>
                                    </td>
                                    <td>
                                        {#if appAny.creator?.role === 'student'}
                                            <span class="badge bg-secondary">Student</span>
                                        {:else if appAny.creator}
                                            <span class="badge bg-info text-dark" title={appAny.creator.role}>{appAny.creator.full_name}</span>
                                        {:else}
                                            <span class="text-muted">-</span>
                                        {/if}
                                    </td>
                                    <td>
                                        <div>{new Date(appAny.updated_at).toLocaleDateString()}</div>
                                        {#if appAny.updater}
                                            <small class="text-muted">by {appAny.updater.full_name}</small>
                                        {/if}
                                    </td>
                                    <td>
                                        <div class="d-flex gap-1 flex-wrap">
                                            <a href="/deo/apply?applicationId={appAny.id}" class="btn btn-sm btn-outline-primary">
                                                {appAny.status === 'draft' || appAny.status === 'needs_correction' ? 'Edit' : 'View'}
                                            </a>
                                            {#if appAny.status === 'approved' && isProvisional(appAny)}
                                                {#if !isPaid(appAny)}
                                                    <button class="btn btn-sm btn-success" on:click={() => openPaymentModal(appAny)}>
                                                        <i class="bi bi-cash-coin"></i> Fee
                                                    </button>
                                                {:else}
                                                    <button class="btn btn-sm btn-info text-white" on:click={() => printReceipt(appAny)}>
                                                        <i class="bi bi-printer"></i> Receipt
                                                    </button>
                                                    <button class="btn btn-sm btn-warning" on:click={() => printUndertaking(appAny)}>
                                                        <i class="bi bi-file-text"></i> Undertaking
                                                    </button>
                                                {/if}
                                            {/if}
                                        </div>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}
                <p class="text-muted text-center py-4">No applications found matching your criteria.</p>
            {/if}
        </div>
    </div>
    {#if totalPages > 1}
    <div class="card-footer">
        <nav aria-label="Applications list pagination">
            <ul class="pagination justify-content-center mb-0">
                <li class="page-item" class:disabled={currentPage === 1}>
                    <button class="page-link" on:click={() => gotoPage(currentPage - 1)} aria-label="Previous">
                        <span aria-hidden="true">&laquo;</span>
                    </button>
                </li>
                {#each Array(totalPages) as _, i}
                    <li class="page-item" class:active={currentPage === i + 1}>
                        <button class="page-link" on:click={() => gotoPage(i + 1)}>{i + 1}</button>
                    </li>
                {/each}
                <li class="page-item" class:disabled={currentPage === totalPages}>
                    <button class="page-link" on:click={() => gotoPage(currentPage + 1)} aria-label="Next">
                        <span aria-hidden="true">&raquo;</span>
                    </button>
                </li>
            </ul>
        </nav>
    </div>
    {/if}
</div>

<!-- Payment Modal -->
{#if showPaymentModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header bg-success text-white">
                <h5 class="modal-title">Collect Provisional Fee</h5>
                <button type="button" class="btn-close btn-close-white" on:click={closePaymentModal}></button>
            </div>
            <form method="POST" action="?/collectProvFee" use:enhance={() => {
                isSubmittingPayment = true;
                return async ({ result, update }) => {
                    isSubmittingPayment = false;
                    if (result.type === 'success') {
                        toastStore.success('Payment Recorded Successfully');
                        closePaymentModal();
                    } else {
                        toastStore.error(result.data?.message || 'Payment Failed');
                    }
                    await update();
                };
            }}>
                <div class="modal-body">
                    <input type="hidden" name="application_id" value={currentApp?.id} />
                    
                    <div class="text-center mb-4">
                        <h2 class="text-success fw-bold">₹ {paymentDetails.amount}</h2>
                        <p class="text-muted">Provisional Seat Reservation Fee</p>
                        {#if paymentDetails.qrCodeUrl}
                            <div class="bg-light border rounded p-3 d-inline-block">
                                <img height="400" src={paymentDetails.qrCodeUrl} alt="QR Code" style="max-width: 450px; max-height: 450px;" on:error={(e) => { paymentDetails.qrCodeUrl = ''; }} />
                                <div class="small mt-2 text-muted">Scan to Pay</div>
                            </div>
                        {:else}
                            <div class="bg-light border rounded p-3 d-inline-block">
                                <i class="bi bi-qr-code-scan display-1 text-secondary"></i>
                                <div class="small mt-2 text-muted">No QR Code configured</div>
                            </div>
                        {/if}
                    </div>

                    <div class="mb-3">
                        <label class="form-label">Payment Mode</label>
                        <select class="form-select" name="payment_mode" bind:value={paymentDetails.mode}>
                            <option value="cash">Cash</option>
                            <option value="qr">UPI / QR Code</option>
                            <option value="cheque">Cheque / DD</option>
                        </select>
                    </div>

                    <div class="mb-3">
                        <label class="form-label">Reference No / Transaction ID</label>
                        <input type="text" class="form-control" name="reference_no" bind:value={paymentDetails.reference} placeholder="e.g. UPI Ref, Receipt No..." required />
                    </div>
                    
                    <input type="hidden" name="amount" value={paymentDetails.amount} />
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={closePaymentModal}>Cancel</button>
                    <button type="submit" class="btn btn-success" disabled={isSubmittingPayment}>
                        {isSubmittingPayment ? 'Processing...' : 'Confirm Payment'}
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>
{/if}
