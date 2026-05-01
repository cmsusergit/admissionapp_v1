<script lang="ts">
    import type { PageData } from './$types';
    import { enhance } from '$app/forms';
    import { toastStore } from '$lib/stores/toastStore';
    import { invalidateAll, goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let data: PageData;

    $: console.log('[BulkSvelte] Received applications:', data.applications);
    $: if (data.applications?.length > 0) {
        console.log('[BulkSvelte] Sample application documents:', data.applications[0].documents);
    }

    let selectedDocument: any = null;
    let showRejectModal = false;
    let rejectionReason = '';
    let previewDoc: any = null;

    // Filter and Search State
    let filterSearch = data.search || '';
    let filterCourseId = data.courseFilter || '';
    let filterStatus = data.statusFilter || 'submitted';

    function openPreview(doc: any) {
        previewDoc = doc;
    }

    function openReject(doc: any) {
        selectedDocument = doc;
        rejectionReason = '';
        showRejectModal = true;
    }

    function closeReject() {
        showRejectModal = false;
        selectedDocument = null;
    }

    // Pagination variables
    function changePage(newPage: number) {
        const url = new URL($page.url);
        url.searchParams.set('page', newPage.toString());
        goto(url.toString());
    }

    function applyFilters() {
        const query = new URLSearchParams();
        if (filterSearch) query.set('search', filterSearch);
        if (filterCourseId) query.set('courseId', filterCourseId);
        if (filterStatus) query.set('status', filterStatus);
        query.set('page', '1'); // Always reset to page 1 on new filter application
        goto(`?${query.toString()}`);
    }

    function clearFilters() {
        filterSearch = '';
        filterCourseId = '';
        filterStatus = 'submitted'; // Reset to default status
        goto('?'); // Go to base URL to clear all params
    }

    $: totalPages = Math.ceil((data.count || 0) / (data.limit || 50));
</script>

<div class="container-fluid mt-4 pb-5">
    <div class="d-flex justify-content-between align-items-center mb-4">
                <h1>Bulk Verification (DEO) <span class="badge bg-secondary">{data.count}</span></h1>
                
                <div class="d-flex gap-2 align-items-center">
                    <input type="text" class="form-control" placeholder="Search name/email" bind:value={filterSearch} on:change={applyFilters}>
                    <select class="form-select" bind:value={filterCourseId} on:change={applyFilters}>
                        <option value="">All Courses</option>
                        {#each data.courses as course}
                            <option value={course.id}>{course.name}</option>
                        {/each}
                    </select>
                    <select class="form-select" bind:value={filterStatus} on:change={applyFilters}>
                        <option value="submitted">Pending (Submitted)</option>
                        <option value="verified">Verified</option>
                        <option value="needs_correction">Needs Correction</option>
                    </select>
                    <button class="btn btn-primary" on:click={applyFilters}>Apply Filters</button>
                    <button class="btn btn-outline-secondary" on:click={clearFilters}>Clear Filters</button>
                </div>        </div>
        
        {#if data.applications.length === 0}
            <div class="alert alert-info text-center">No applications found for the selected criteria.</div>
        {:else}
            <div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-4">
                {#each data.applications as app (app.id)}
                    <div class="col">
                        <div class="card h-100 shadow-sm border-0">
                            <div class="card-header bg-white d-flex justify-content-between align-items-start">
                                <div>
                                    <h5 class="card-title mb-0 text-truncate" title={app.student_user?.full_name}>{app.student_user?.full_name}</h5>
                                    <small class="text-muted">{app.courses?.name}</small>
                                </div>
                                <span class="badge {app.status === 'verified' ? 'bg-success' : app.status === 'needs_correction' ? 'bg-danger' : 'bg-warning text-dark'}">
                                    {app.status}
                                </span>
                            </div>
                            
                            <div class="card-body bg-light">
                                <!-- Document Strip -->
                                <div class="d-flex gap-2 overflow-auto pb-2" style="white-space: nowrap;">
                                    {#if app.documents && app.documents.length > 0}
                                        {#each app.documents as doc}
                                            <div class="position-relative d-inline-block doc-container" style="width: 100px; height: 100px;">
                                                <!-- Thumbnail -->
                                                <!-- svelte-ignore a11y-click-events-have-key-events -->
                                                <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
                                                <div 
                                                    class="border rounded bg-white h-100 w-100 d-flex align-items-center justify-content-center overflow-hidden cursor-pointer shadow-sm position-relative"
                                                    on:click={() => openPreview(doc)}
                                                    style="cursor: pointer; {doc.status === 'rejected' ? 'border: 2px solid red !important;' : ''}"
                                                >
                                                    {#if doc.file_name.toLowerCase().endsWith('.pdf')}
                                                        <i class="bi bi-file-earmark-pdf fs-1 text-danger"></i>
                                                    {:else}
                                                        <img src={doc.signed_url} alt="Doc" class="img-fluid" style="object-fit: cover; height: 100%; width: 100%;">
                                                    {/if}
                                                    
                                                    <!-- Status Overlay -->
                                                    {#if doc.status === 'rejected'}
                                                        <div class="position-absolute top-0 start-0 w-100 h-100 bg-danger bg-opacity-25 d-flex align-items-center justify-content-center">
                                                            <i class="bi bi-x-circle-fill text-danger fs-3"></i>
                                                        </div>
                                                    {/if}
                                                </div>
        
                                                <!-- Label -->
                                                <div class="text-truncate small mt-1 text-center" title={doc.document_type}>
                                                    {doc.document_type}
                                                </div>
        
                                                <!-- Action Buttons -->
                                                {#if doc.status === 'rejected'}
                                                    <form method="POST" action="?/undoRejectDocument" class="position-absolute top-0 end-0 m-1" use:enhance={() => {
                                                        return async ({ result }) => {
                                                            if (result.type === 'success') {
                                                                toastStore.success('Rejection undone');
                                                                await invalidateAll();
                                                            }
                                                        };
                                                    }}>
                                                        <input type="hidden" name="document_id" value={doc.id}>
                                                        <input type="hidden" name="application_id" value={app.id}>
                                                        <button 
                                                            class="btn btn-sm btn-circle btn-warning p-0 d-flex align-items-center justify-content-center shadow"
                                                            style="width: 24px; height: 24px; border-radius: 50%;"
                                                            title="Undo Rejection"
                                                        >
                                                            <i class="bi bi-arrow-counterclockwise text-dark" style="font-size: 0.8rem;"></i>
                                                        </button>
                                                    </form>
                                                {:else if !['verified', 'approved'].includes(app.status)}
                                                    <button 
                                                        class="btn btn-sm btn-circle btn-danger position-absolute top-0 end-0 m-1 p-0 d-flex align-items-center justify-content-center"
                                                        style="width: 24px; height: 24px; border-radius: 50%; display: none;"
                                                        on:click={() => openReject(doc)}
                                                        title="Reject Document"
                                                    >
                                                        <i class="bi bi-x"></i>
                                                    </button>
                                                {/if}
                                            </div>
                                        {/each}
                                    {:else}
                                        <div class="text-muted small w-100 text-center py-4">No documents uploaded.</div>
                                    {/if}
                                </div>
                            </div>
        
                            <div class="card-footer bg-white d-flex justify-content-between">
                                {#if app.status !== 'verified'}
                                    <form method="POST" action="?/verifyStudent" use:enhance={() => {
                                        return async ({ result }) => {
                                            if (result.type === 'success') {
                                                toastStore.success('Documents verified');
                                                await invalidateAll();
                                            }
                                        };
                                    }}>
                                        <input type="hidden" name="application_id" value={app.id}>
                                        <button class="btn btn-success btn-sm w-100" disabled={app.status === 'needs_correction'}>
                                            <i class="bi bi-check-all me-1"></i> Verify Documents
                                        </button>
                                    </form>
                                {:else}
                                    <span class="text-success small"><i class="bi bi-check-circle-fill"></i> Completed</span>
                                {/if}
                                
                                <!-- No detailed view link for DEO typically unless added -->
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
            {#if totalPages > 1}
                <div class="d-flex justify-content-center mt-4">
                    <button class="btn btn-sm btn-secondary me-2" disabled={data.page <= 1} on:click={() => changePage(data.page - 1)}>Prev</button>
                    <span class="align-self-center">Page {data.page} of {totalPages}</span>
                    <button class="btn btn-sm btn-secondary ms-2" disabled={data.page >= totalPages} on:click={() => changePage(data.page + 1)}>Next</button>
                </div>
            {/if}
            {/if}
</div>

<!-- Lightbox Modal -->
{#if previewDoc}
    <div class="modal d-block" style="background: rgba(0,0,0,0.85); z-index: 1055;" on:click|self={() => previewDoc = null}>
        <div class="modal-dialog modal-xl modal-dialog-centered">
            <div class="modal-content h-100 bg-transparent border-0 shadow-none">
                <div class="modal-header border-0">
                    <h5 class="modal-title text-white">{previewDoc.document_type} - {previewDoc.file_name}</h5>
                    <button type="button" class="btn-close btn-close-white" on:click={() => previewDoc = null}></button>
                </div>
                <div class="modal-body d-flex align-items-center justify-content-center p-0" style="height: 80vh;">
                    {#if previewDoc.file_name.toLowerCase().endsWith('.pdf')}
                        <iframe src={previewDoc.signed_url} class="w-100 h-100 bg-white rounded" title="Document Preview"></iframe>
                    {:else}
                        <img src={previewDoc.signed_url} class="img-fluid rounded" style="max-height: 100%; max-width: 100%; object-fit: contain;" alt="Preview">
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- Reject Modal -->
{#if showRejectModal}
    <div class="modal d-block" style="background: rgba(0,0,0,0.5);">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Reject Document</h5>
                    <button type="button" class="btn-close" on:click={closeReject}></button>
                </div>
                <form method="POST" action="?/rejectDocument" use:enhance={() => {
                    return async ({ result }) => {
                        if (result.type === 'success') {
                            toastStore.warning('Document rejected');
                            closeReject();
                            await invalidateAll();
                        } else if (result.type === 'failure') {
                            toastStore.error(result.data?.message || 'Failed to reject document.');
                        }
                    };
                }}>
                    <div class="modal-body">
                        <input type="hidden" name="document_id" value={selectedDocument?.id}>
                        <input type="hidden" name="application_id" value={selectedDocument?.application_id}>
                        <p>Rejecting: <strong>{selectedDocument?.document_type}</strong></p>
                        <label class="form-label">Reason</label>
                        <textarea name="reason" class="form-control" rows="3" bind:value={rejectionReason} required placeholder="E.g. Blurry, Incorrect document..."></textarea>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" on:click={closeReject}>Cancel</button>
                        <button type="submit" class="btn btn-danger">Reject Document</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
{/if}

<style>
    .doc-container button.btn-danger {
        display: none !important;
    }
    .doc-container:hover button.btn-danger {
        display: flex !important;
    }
</style>