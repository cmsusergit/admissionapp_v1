<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import { invalidate } from '$app/navigation';
    import { toastStore } from '$lib/stores/toastStore';
    import { goto } from '$app/navigation';
    import { page as sveltePage } from '$app/stores';

    export let data: PageData;
    export let form: ActionData;

    // State
    let selectedApplication: any | null = null;
    let showDetailsModal = false;
    let showRejectionReasonModal = false;
    let showApproveModal = false;
    let showWaitlistModal = false;
    
    let applicationRejectionReason = '';
    let applicationApprovalComment = '';
    let selectedBranchId = '';
    
    // Params
    $: activeTab = data.activeTab || 'verified';
    $: searchQuery = data.search || '';
    $: totalPages = Math.ceil((data.count || 0) / data.limit);

    // Helpers
    function updateQuery(updates: Record<string, string>) {
        const params = new URLSearchParams($sveltePage.url.searchParams);
        for (const [key, value] of Object.entries(updates)) {
            if (value) params.set(key, value);
            else params.delete(key);
        }
        goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
    }

    function triggerSearch() { updateQuery({ search: searchQuery, page: '1' }); }
    function handleKeydown(e: KeyboardEvent) { if (e.key === 'Enter') triggerSearch(); }
    function changePage(p: number) { updateQuery({ page: p.toString() }); }
    function switchTab(t: string) { updateQuery({ tab: t, page: '1', search: '' }); }

    function viewDetails(app: any) {
        selectedApplication = app;
        showDetailsModal = true;
    }

    function openApproveModal(app: any) {
        selectedApplication = app;
        selectedBranchId = '';
        applicationApprovalComment = '';
        
        const isSpecial = app.form_type === 'MQ/NRI' || app.form_type === 'Vacant';
        const hasBranches = app.courses?.branches && app.courses.branches.length > 0;
        const needsBranch = (!app.branch_id || isSpecial) && hasBranches;

        if (needsBranch) {
            selectedBranchId = app.branch_id || '';
            showApproveModal = true;
        } else {
            // Confirm direct approval
            if(confirm(`Approve application for ${app.users?.full_name}?`)) {
                submitApproval();
            }
        }
    }

    async function submitApproval() {
        if (!selectedApplication) return;
        const formData = new FormData();
        formData.append('application_id', selectedApplication.id);
        if (selectedBranchId) formData.append('branch_id', selectedBranchId);
        if (applicationApprovalComment) formData.append('approval_comment', applicationApprovalComment);

        const response = await fetch('?/approveApplication', { method: 'POST', body: formData });
        
        const text = await response.text();
        let res;
        try {
             const { deserialize } = await import('$app/forms');
             res = deserialize(text);
        } catch (e) {
             console.error('Error deserializing response', e);
             toastStore.error('Network error');
             return;
        }
        
        showApproveModal = false;
        if (res.type === 'success') {
            toastStore.success('Application approved!');
            await invalidate('/university-auth/applications');
        } else {
            const errorMsg = (res.data as any)?.message || 'Error approving.';
            toastStore.error(errorMsg);
        }
    }

    async function waitlistApp(app: any) {
        if(!confirm(`Waitlist application for ${app.users?.full_name}?`)) return;
        const fd = new FormData();
        fd.append('application_id', app.id);
        const res = await fetch('?/waitlistApplication', { method: 'POST', body: fd });
        const r = await res.json();
        if (r.success) {
            toastStore.success('Waitlisted');
            await invalidate('/university-auth/applications');
        } else {
            toastStore.error(r.message);
        }
    }

    function openWaitlistModal(app: any) {
        selectedApplication = app;
        applicationApprovalComment = '';
        showWaitlistModal = true;
    }

    async function submitWaitlist() {
        if (!selectedApplication) return;
        const fd = new FormData();
        fd.append('application_id', selectedApplication.id);
        if (applicationApprovalComment) fd.append('approval_comment', applicationApprovalComment);
        
        const res = await fetch('?/waitlistApplication', { method: 'POST', body: fd });
        const r = await res.json();
        showWaitlistModal = false;
        if (r.success) {
            toastStore.success('Waitlisted');
            await invalidate('/university-auth/applications');
        } else {
            toastStore.error(r.message);
        }
    }

    function openRejectModal(app: any) {
        selectedApplication = app;
        applicationRejectionReason = '';
        showRejectionReasonModal = true;
    }

    async function submitReject() {
        if (!applicationRejectionReason) return;
        const fd = new FormData();
        fd.append('application_id', selectedApplication.id);
        fd.append('rejection_reason', applicationRejectionReason);
        
        const res = await fetch('?/rejectApplication', { method: 'POST', body: fd });
        const r = await res.json();
        showRejectionReasonModal = false;
        if (r.success) {
            toastStore.success('Rejected');
            await invalidate('/university-auth/applications');
        } else {
            toastStore.error(r.message);
        }
    }

    async function revertApp(app: any) {
        if(!confirm(`Revert approval for ${app.users?.full_name}? This will revoke admission.`)) return;
        const fd = new FormData();
        fd.append('application_id', app.id);
        
        const res = await fetch('?/revertApproval', { method: 'POST', body: fd });
        const r = await res.json();
        if (r.type === 'success') {
            toastStore.success('Reverted');
            await invalidate('/university-auth/applications');
        } else {
            toastStore.error(r.data?.message || 'Error reverting.');
        }
    }

    function formatKey(key: string) {
        return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    function isMeritField(value: any) {
        return typeof value === 'object' && value !== null && 'value' in value && 'max_score' in value;
    }
</script>

<div class="container-fluid mt-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1>Applications Management</h1>
    </div>

    <!-- Controls -->
    <div class="card mb-4">
        <div class="card-body">
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="input-group">
                        <input type="text" class="form-control" placeholder="Search Name, Email..." 
                               bind:value={searchQuery} on:keydown={handleKeydown}>
                        <button class="btn btn-primary" on:click={triggerSearch}>
                            <i class="bi bi-search"></i> Search
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Tabs -->
    <div class="card">
        <div class="card-header">
            <ul class="nav nav-tabs card-header-tabs">
                <li class="nav-item">
                    <a 
                        href="?tab=verified&page=1&search={searchQuery}"
                        class="nav-link {activeTab === 'verified' ? 'active' : ''}"
                        data-sveltekit-noscroll
                        data-sveltekit-keepfocus
                    >
                        Pending Verification
                    </a>
                </li>
                <li class="nav-item">
                    <a 
                        href="?tab=approved&page=1&search={searchQuery}"
                        class="nav-link {activeTab === 'approved' ? 'active' : ''}"
                        data-sveltekit-noscroll
                        data-sveltekit-keepfocus
                    >
                        Approved List
                    </a>
                </li>
            </ul>
        </div>
    </div>

    <!-- Table View -->
    <div class="card shadow-sm border-top-0 rounded-top-0">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead class="bg-light">
                        <tr>
                            <th>Student</th>
                            <th>Course / Branch</th>
                            <th>Cycle</th>
                            <th>Submitted</th>
                            <th>Status</th>
                            <th class="text-end">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each data.applications as app}
                            <tr>
                                <td>
                                    <div class="fw-bold">{app.users?.full_name || 'Unknown'}</div>
                                    <small class="text-muted">{app.users?.email}</small>
                                </td>
                                <td>
                                    {app.courses?.name}
                                    {#if app.branches}
                                        <br><span class="badge bg-secondary text-light">{app.branches.name}</span>
                                    {/if}
                                    <div class="small text-muted">{app.courses?.colleges?.name}</div>
                                </td>
                                <td>{app.admission_cycles?.name}</td>
                                <td>{new Date(app.submitted_at).toLocaleDateString()}</td>
                                <td>
                                    <span class="badge {app.status === 'approved' ? 'bg-success' : 'bg-info'}">
                                        {app.status}
                                    </span>
                                    {#if app.approval_comment}
                                        <span class="badge bg-light text-dark border ms-1" title="Approval Comment">
                                            <i class="bi bi-chat-left-text me-1"></i>{app.approval_comment}
                                        </span>
                                    {/if}
                                </td>
                                <td class="text-end">
                                    <button class="btn btn-sm btn-outline-secondary me-1" on:click={() => viewDetails(app)} title="View Details">
                                        <i class="bi bi-eye"></i>
                                    </button>

                                    {#if activeTab === 'verified'}
                                        <button class="btn btn-sm btn-success me-1" on:click={() => openApproveModal(app)} title="Approve">
                                            <i class="bi bi-check-lg"></i>
                                        </button>
                                        <button class="btn btn-sm btn-warning me-1" on:click={() => openWaitlistModal(app)} title="Waitlist">
                                            <i class="bi bi-hourglass"></i>
                                        </button>
                                        <button class="btn btn-sm btn-danger" on:click={() => openRejectModal(app)} title="Reject">
                                            <i class="bi bi-x-lg"></i>
                                        </button>
                                    {:else if activeTab === 'approved'}
                                        <button class="btn btn-sm btn-outline-danger" on:click={() => revertApp(app)} title="Revert Approval">
                                            <i class="bi bi-arrow-counterclockwise"></i>
                                        </button>
                                    {/if}
                                </td>
                            </tr>
                        {:else}
                            <tr>
                                <td colspan="6" class="text-center py-5 text-muted">No applications found.</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
        
        <!-- Pagination -->
        {#if totalPages > 1}
            <div class="card-footer d-flex justify-content-center">
                <button class="btn btn-sm btn-secondary me-2" disabled={data.page <= 1} on:click={() => changePage(data.page - 1)}>Prev</button>
                <span class="align-self-center">Page {data.page} of {totalPages}</span>
                <button class="btn btn-sm btn-secondary ms-2" disabled={data.page >= totalPages} on:click={() => changePage(data.page + 1)}>Next</button>
            </div>
        {/if}
    </div>
</div>

<!-- Details Modal -->
{#if showDetailsModal && selectedApplication}
<div class="modal d-block" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Application Details</h5>
                <button type="button" class="btn-close" on:click={() => showDetailsModal = false}></button>
            </div>
            <div class="modal-body">
                <div class="row mb-3">
                    <div class="col-md-6">
                        <h6>Student Info</h6>
                        <p class="mb-1"><strong>Name:</strong> {selectedApplication.users?.full_name}</p>
                        <p class="mb-1"><strong>Email:</strong> {selectedApplication.users?.email}</p>
                    </div>
                    <div class="col-md-6">
                        <h6>Status</h6>
                        <p class="mb-1"><strong>Current:</strong> {selectedApplication.status}</p>
                        <p class="mb-1"><strong>Form Type:</strong> {selectedApplication.form_type}</p>
                    </div>
                </div>
                
                <h6>Form Data</h6>
                <div class="bg-light p-3 rounded mb-3">
                    {#if selectedApplication.form_data && Object.keys(selectedApplication.form_data).length > 0}
                        <dl class="row mb-0">
                            {#each Object.entries(selectedApplication.form_data) as [key, value]}
                                <dt class="col-sm-4 text-muted small text-uppercase">{formatKey(key)}</dt>
                                <dd class="col-sm-8">
                                    {#if isMeritField(value)}
                                        <span class="fw-bold">{value.value}</span> / {value.max_score}
                                    {:else if typeof value === 'object' && value !== null}
                                        <pre class="mb-0 small">{JSON.stringify(value)}</pre>
                                    {:else}
                                        {value}
                                    {/if}
                                </dd>
                            {/each}
                        </dl>
                    {:else}
                        <p class="text-muted mb-0">No data available.</p>
                    {/if}
                </div>

                <h6>Documents</h6>
                {#if selectedApplication.documents?.length > 0}
                    <div class="table-responsive">
                        <table class="table table-striped table-sm mb-0">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>View</th>
                                    <th>Status</th>
                                    <th>Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each selectedApplication.documents as doc}
                                    <tr>
                                        <td>{doc.document_type}</td>
                                        <td>
                                            <a href={doc.signed_url || '#'} target="_blank" class="btn btn-sm btn-outline-primary py-0">
                                                View <i class="bi bi-box-arrow-up-right ms-1"></i>
                                            </a>
                                        </td>
                                        <td><span class="badge {doc.status === 'approved' ? 'bg-success' : doc.status === 'rejected' ? 'bg-danger' : 'bg-warning'}">{doc.status}</span></td>
                                        <td>{doc.rejection_reason || 'N/A'}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {:else}
                    <p class="text-muted">No documents.</p>
                {/if}
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" on:click={() => showDetailsModal = false}>Close</button>
                {#if activeTab === 'verified'}
                    <button class="btn btn-success" on:click={() => openApproveModal(selectedApplication)}>Approve</button>
                {/if}
            </div>
        </div>
    </div>
</div>
{/if}

<!-- Approve Modal -->
{#if showApproveModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Confirm Approval</h5>
                <button type="button" class="btn-close" on:click={() => showApproveModal = false}></button>
            </div>
            <div class="modal-body">
                <p>Select Branch for {selectedApplication?.users?.full_name}:</p>
                {#if selectedApplication?.courses?.branches}
                    <select class="form-select mb-3" bind:value={selectedBranchId}>
                        <option value="">-- Select Branch --</option>
                        {#each selectedApplication.courses.branches as branch}
                            <option value={branch.id}>{branch.name} ({branch.code})</option>
                        {/each}
                    </select>
                {/if}
                <label class="form-label">Approval Comment (Optional)</label>
                <textarea class="form-control" bind:value={applicationApprovalComment} placeholder="Add a comment..." rows="2"></textarea>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" on:click={() => showApproveModal = false}>Cancel</button>
                <button class="btn btn-success" on:click={submitApproval} disabled={!selectedBranchId && selectedApplication?.courses?.branches?.length > 0}>Confirm</button>
            </div>
        </div>
    </div>
</div>
{/if}

<!-- Waitlist Modal -->
{#if showWaitlistModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Waitlist Application</h5>
                <button type="button" class="btn-close" on:click={() => showWaitlistModal = false}></button>
            </div>
            <div class="modal-body">
                <p>Waitlist application for {selectedApplication?.users?.full_name}?</p>
                <label class="form-label">Comment (Optional)</label>
                <textarea class="form-control" bind:value={applicationApprovalComment} placeholder="Add a comment..." rows="2"></textarea>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" on:click={() => showWaitlistModal = false}>Cancel</button>
                <button class="btn btn-warning" on:click={submitWaitlist}>Waitlist</button>
            </div>
        </div>
    </div>
</div>
{/if}

<!-- Reject Modal -->
{#if showRejectionReasonModal}
<div class="modal d-block" style="background: rgba(0,0,0,0.5)">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Reject Application</h5>
                <button type="button" class="btn-close" on:click={() => showRejectionReasonModal = false}></button>
            </div>
            <div class="modal-body">
                <textarea class="form-control" bind:value={applicationRejectionReason} placeholder="Reason for rejection..." rows="3"></textarea>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" on:click={() => showRejectionReasonModal = false}>Cancel</button>
                <button class="btn btn-danger" on:click={submitReject}>Reject</button>
            </div>
        </div>
    </div>
</div>
{/if}
