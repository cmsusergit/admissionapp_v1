<script lang="ts">
    import { goto, invalidateAll } from '$app/navigation';
    import { page as pageStore } from '$app/stores';
    import { deserialize } from '$app/forms';
    import { supabase } from '$lib/supabase';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';

    interface InquiryPageData {
        inquiries: any[];
        totalCount: number;
        academicYears: any[];
        courses: any[];
        filters: {
            page: number;
            pageSize: number;
            academicYearId: string;
            courseId: string;
            status: string;
            search: string;
        };
    }

    let { data } = $props<{ data: InquiryPageData }>();
    
    let selectedInquiry = $state<any>(null);
    let selectedIds = $state<string[]>([]);

    // Helper to find the best name to display
    function getDisplayName(inquiry: any) {
        const d = inquiry.inquiry_data || {};
        
        // 1. Try to construct from components in inquiry_data
        const title = d.title || d.salutation || d.prefix || '';
        const first = d.first_name || d.fname || d.first || '';
        const middle = d.middle_name || d.mname || d.middle || '';
        const last = d.last_name || d.lname || d.surname || d.last || '';
        
        const combined = [title, first, middle, last].filter(val => val && typeof val === 'string').map(val => val.trim()).filter(Boolean).join(' ');
        
        if (combined && combined.length > (first.length || 0)) {
            return combined;
        }

        // 2. Fallback to full_name column
        if (inquiry.full_name) return inquiry.full_name;

        // 3. Fallback to any key containing "name" in inquiry_data
        const nameKey = Object.keys(d).find(k => k.toLowerCase().includes('name') && d[k]);
        if (nameKey) return d[nameKey];

        return 'Anonymous';
    }

    // Filter states
    let search = $state(data.filters.search || '');
    let academicYearId = $state(data.filters.academicYearId || '');
    let courseId = $state(data.filters.courseId || '');
    let status = $state(data.filters.status || '');

    function applyFilters() {
        const params = new URLSearchParams($pageStore.url.searchParams);
        params.set('page', '1');
        if (search) params.set('search', search); else params.delete('search');
        if (academicYearId) params.set('academicYearId', academicYearId); else params.delete('academicYearId');
        if (courseId) params.set('courseId', courseId); else params.delete('courseId');
        if (status) params.set('status', status); else params.delete('status');
        
        goto(`?${params.toString()}`, { keepFocus: true });
    }

    function changePage(newPage: number) {
        const params = new URLSearchParams($pageStore.url.searchParams);
        params.set('page', newPage.toString());
        goto(`?${params.toString()}`);
    }

    async function toggleProcessed(inquiry: any) {
        const newValue = !inquiry.is_processed;
        const { error } = await supabase
            .from('inquiries')
            .update({ is_processed: newValue })
            .eq('id', inquiry.id);

        if (error) {
            alert('Error: ' + error.message);
        } else {
            inquiry.is_processed = newValue;
        }
    }

    async function deleteSelectedInquiries() {
        if (selectedIds.length === 0) return;
        
        if (!confirm(`Are you sure you want to delete ${selectedIds.length} inquiry(s)? This action cannot be undone.`)) {
            return;
        }

        startLoading();
        const formData = new FormData();
        formData.append('ids', JSON.stringify(selectedIds));

        try {
            const response = await fetch('?/deleteInquiries', {
                method: 'POST',
                body: formData
            });

            const result = deserialize(await response.text());

            if (result.type === 'success') {
                selectedIds = [];
                selectedInquiry = null;
                await invalidateAll();
            } else if (result.type === 'failure') {
                alert('Error: ' + (result.data?.message || 'Failed to delete records'));
            }
        } catch (e) {
            console.error(e);
            alert('An unexpected error occurred.');
        } finally {
            stopLoading();
        }
    }

    function toggleSelectAll(checked: boolean) {
        if (checked) {
            selectedIds = data.inquiries.map((i: any) => i.id);
        } else {
            selectedIds = [];
        }
    }

    function toggleSelect(id: string) {
        if (selectedIds.includes(id)) {
            selectedIds = selectedIds.filter(i => i !== id);
        } else {
            selectedIds = [...selectedIds, id];
        }
    }

    function viewDetails(inquiry: any) {
        selectedInquiry = inquiry;
        if (selectedInquiry.preferences) {
            selectedInquiry.preferences.sort((a: any, b: any) => a.priority - b.priority);
        }
    }

    let totalPages = $derived(Math.ceil(data.totalCount / data.filters.pageSize));
</script>

<div class="container-fluid py-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1>Public Inquiries</h1>
        <div class="d-flex gap-2 align-items-center">
            <span class="badge bg-secondary">Total Inquiries: {data.totalCount}</span>
            {#if selectedIds.length > 0}
                <span class="badge bg-danger">{selectedIds.length} Selected</span>
            {/if}
        </div>
    </div>

    <!-- Filter Bar -->
    <div class="card shadow-sm mb-4">
        <div class="card-body">
            <form class="row g-3" onsubmit={(e) => { e.preventDefault(); applyFilters(); }}>
                <div class="col-md-3">
                    <label class="form-label small fw-bold">Search</label>
                    <input type="text" class="form-control" placeholder="Name, Email or Phone..." bind:value={search} />
                </div>
                <div class="col-md-2">
                    <label class="form-label small fw-bold">Academic Year</label>
                    <select class="form-select" bind:value={academicYearId}>
                        <option value="">All Years</option>
                        {#each data.academicYears as year}
                            <option value={year.id}>{year.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label small fw-bold">Interested Course</label>
                    <select class="form-select" bind:value={courseId}>
                        <option value="">Any Course</option>
                        {#each data.courses as course}
                            <option value={course.id}>{course.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="form-label small fw-bold">Status</label>
                    <select class="form-select" bind:value={status}>
                        <option value="">All Status</option>
                        <option value="new">New</option>
                        <option value="processed">Processed</option>
                    </select>
                </div>
                <div class="col-md-3 d-flex align-items-end gap-2">
                    <button type="submit" class="btn btn-primary flex-grow-1">
                        <i class="bi bi-search me-1"></i> Filter
                    </button>
                    {#if selectedIds.length > 0}
                        <button type="button" class="btn btn-danger" onclick={deleteSelectedInquiries} title="Delete Selected">
                            <i class="bi bi-trash"></i>
                        </button>
                    {/if}
                    <button type="button" class="btn btn-outline-secondary" onclick={() => {
                        search = ''; academicYearId = ''; courseId = ''; status = '';
                        selectedIds = [];
                        applyFilters();
                    }}>Reset</button>
                </div>
            </form>
        </div>
    </div>

    <div class="row">
        <!-- Inquiry List -->
        <div class="col-lg-7">
            <div class="card shadow-sm h-100">
                <div class="table-responsive">
                    <table class="table table-hover mb-0 align-middle">
                        <thead class="table-light">
                            <tr>
                                <th style="width: 40px;">
                                    <input 
                                        type="checkbox" 
                                        class="form-check-input" 
                                        checked={selectedIds.length === data.inquiries.length && data.inquiries.length > 0}
                                        onchange={(e) => toggleSelectAll(e.currentTarget.checked)}
                                    />
                                </th>
                                <th>Student Info</th>
                                <th>Inquiry Date</th>
                                <th>Academic Year</th>
                                <th>Status</th>
                                <th class="text-end">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.inquiries as inquiry}
                                <tr class={selectedInquiry?.id === inquiry.id ? 'table-primary' : ''}>
                                    <td>
                                        <input 
                                            type="checkbox" 
                                            class="form-check-input" 
                                            checked={selectedIds.includes(inquiry.id)}
                                            onchange={() => toggleSelect(inquiry.id)}
                                        />
                                    </td>
                                    <td>
                                        <div class="fw-bold">{getDisplayName(inquiry)}</div>
                                        <div class="small text-muted">{inquiry.email}</div>
                                        <div class="small text-muted">{inquiry.phone || ''}</div>
                                    </td>
                                    <td>
                                        <div class="small fw-medium">{new Date(inquiry.created_at).toLocaleDateString()}</div>
                                        <div class="smaller text-muted">{new Date(inquiry.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                    </td>
                                    <td>
                                        <span class="small">{inquiry.academic_year?.name || 'N/A'}</span>
                                    </td>
                                    <td>
                                        {#if inquiry.inquiry_data?.conversion_status === 'Converted'}
                                            <span class="badge bg-success shadow-sm">
                                                <i class="bi bi-mortarboard-fill me-1"></i> Converted
                                            </span>
                                        {:else}
                                            <span class="badge {inquiry.is_processed ? 'bg-secondary' : 'bg-warning text-dark'}">
                                                {inquiry.is_processed ? 'Processed' : 'New'}
                                            </span>
                                        {/if}
                                    </td>
                                    <td class="text-end">
                                        <div class="btn-group">
                                            <button class="btn btn-sm btn-outline-primary" onclick={() => viewDetails(inquiry)}>
                                                Details
                                            </button>
                                            <button 
                                                class="btn btn-sm {inquiry.is_processed ? 'btn-outline-secondary' : 'btn-success'}"
                                                onclick={() => toggleProcessed(inquiry)}
                                                title={inquiry.is_processed ? 'Mark as New' : 'Mark as Processed'}
                                            >
                                                <i class="bi {inquiry.is_processed ? 'bi-x-circle' : 'bi-check-circle'}"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            {:else}
                                <tr>
                                    <td colspan="6" class="text-center py-5 text-muted">
                                        <i class="bi bi-inbox display-1 d-block mb-3 opacity-25"></i>
                                        No inquiries matching your criteria.
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>

                <!-- Pagination -->
                {#if totalPages > 1}
                    <div class="card-footer bg-white d-flex justify-content-between align-items-center">
                        <div class="small text-muted">
                            Showing {(data.filters.page - 1) * data.filters.pageSize + 1} to {Math.min(data.filters.page * data.filters.pageSize, data.totalCount)} of {data.totalCount}
                        </div>
                        <nav>
                            <ul class="pagination pagination-sm mb-0">
                                <li class="page-item {data.filters.page === 1 ? 'disabled' : ''}">
                                    <button class="page-link" onclick={() => changePage(data.filters.page - 1)}>Previous</button>
                                </li>
                                {#each Array(totalPages) as _, i}
                                    <li class="page-item {data.filters.page === i + 1 ? 'active' : ''}">
                                        <button class="page-link" onclick={() => changePage(i + 1)}>{i + 1}</button>
                                    </li>
                                {/each}
                                <li class="page-item {data.filters.page === totalPages ? 'disabled' : ''}">
                                    <button class="page-link" onclick={() => changePage(data.filters.page + 1)}>Next</button>
                                </li>
                            </ul>
                        </nav>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Detail View -->
        <div class="col-lg-5">
            {#if selectedInquiry}
                <div class="card shadow-sm sticky-top" style="top: 80px;">
                    <div class="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                        <h5 class="mb-0">Inquiry Details</h5>
                        <button class="btn-close btn-close-white" onclick={() => selectedInquiry = null}></button>
                    </div>
                    <div class="card-body">
                        <div class="mb-4">
                            <h6 class="text-uppercase text-muted small fw-bold mb-3 border-bottom pb-1">Personal Info</h6>
                            <div class="row g-2 mb-2">
                                <div class="col-4 text-muted small">Name:</div>
                                <div class="col-8 fw-bold">{getDisplayName(selectedInquiry)}</div>
                                
                                <div class="col-4 text-muted small">Email:</div>
                                <div class="col-8"><a href="mailto:{selectedInquiry.email}">{selectedInquiry.email}</a></div>
                                
                                {#if selectedInquiry.phone}
                                    <div class="col-4 text-muted small">Phone:</div>
                                    <div class="col-8">{selectedInquiry.phone}</div>
                                {/if}
                                
                                <div class="col-4 text-muted small">Submitted:</div>
                                <div class="col-8 small">{new Date(selectedInquiry.created_at).toLocaleString()}</div>
                            </div>
                        </div>

                        {#if selectedInquiry.preferences && selectedInquiry.preferences.length > 0}
                            <div class="mb-4">
                                <h6 class="text-uppercase text-muted small fw-bold mb-3 border-bottom pb-1">Course Preferences</h6>
                                <div class="list-group list-group-flush border rounded overflow-hidden">
                                    {#each selectedInquiry.preferences as pref}
                                        <div class="list-group-item d-flex align-items-center py-2">
                                            <span class="badge bg-secondary me-3">#{pref.priority}</span>
                                            <div>
                                                <div class="fw-bold small">{pref.course?.name}</div>
                                                {#if pref.branch?.name}
                                                    <div class="text-muted" style="font-size: 0.75rem;">{pref.branch?.name}</div>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        <div>
                            <h6 class="text-uppercase text-muted small fw-bold mb-3 border-bottom pb-1">Additional Data</h6>
                            <div class="bg-light p-3 rounded border">
                                {#each Object.entries(selectedInquiry.inquiry_data) as [key, value]}
                                    <div class="mb-2">
                                        <div class="small text-muted text-capitalize">{key.replace(/_/g, ' ')}:</div>
                                        <div class="fw-medium small">{value}</div>
                                    </div>
                                {:else}
                                    <div class="text-muted small italic">No additional data provided.</div>
                                {/each}
                            </div>
                        </div>
                    </div>
                    <div class="card-footer bg-white p-3">
                        <a href="mailto:{selectedInquiry.email}?subject=Regarding your inquiry for {selectedInquiry.form?.name}" class="btn btn-sm btn-primary w-100">
                            <i class="bi bi-envelope me-2"></i> Contact via Email
                        </a>
                    </div>
                </div>
            {:else}
                <div class="card shadow-sm h-100 d-flex align-items-center justify-content-center border-dashed p-5 text-muted">
                    <div class="text-center opacity-50">
                        <i class="bi bi-person-lines-fill display-4"></i>
                        <p class="mt-3">Select an inquiry to view preferences and form data.</p>
                    </div>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .border-dashed {
        border-style: dashed !important;
    }
</style>
