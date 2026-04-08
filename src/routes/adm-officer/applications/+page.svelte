<script lang="ts">
    import type { PageData } from './$types';
    import { goto } from '$app/navigation';
    import { page } from '$app/stores';

    export let data: PageData;

    let searchQuery = data.search;

    function triggerSearch() {
        updateQuery({ search: searchQuery, page: '1' });
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') triggerSearch();
    }

    function changePage(newPage: number) {
        updateQuery({ page: newPage.toString() });
    }

    function setStatus(status: string) {
        updateQuery({ status, page: '1', search: '' });
    }

    function updateQuery(updates: Record<string, string>) {
        const params = new URLSearchParams($page.url.searchParams);
        for (const [key, value] of Object.entries(updates)) {
            if (value) params.set(key, value);
            else params.delete(key);
        }
        goto(`?${params.toString()}`);
    }

    $: totalPages = Math.ceil((data.count || 0) / data.limit);
</script>

<div class="container-fluid mt-4">
    <h1 class="mb-4">Applications</h1>

    <!-- Search & Filter -->
    <div class="card mb-4">
        <div class="card-body">
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="input-group">
                        <input type="text" class="form-control" placeholder="Search Name, Enrollment..." 
                               bind:value={searchQuery} on:keydown={handleKeydown}>
                        <button class="btn btn-primary" on:click={triggerSearch}>
                            <i class="bi bi-search"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Tabs -->
    <ul class="nav nav-tabs mb-3">
        <li class="nav-item">
            <button class="nav-link {data.status === 'submitted' ? 'active' : ''}" on:click={() => setStatus('submitted')}>
                Pending Verification
            </button>
        </li>
        <li class="nav-item">
            <button class="nav-link {data.status === 'processed' ? 'active' : ''}" on:click={() => setStatus('processed')}>
                Processed History
            </button>
        </li>
    </ul>

    <!-- List -->
    <div class="card shadow-sm">
        <div class="list-group list-group-flush">
            {#each data.applications as app}
                <a href="/adm-officer/applications/{app.id}" class="list-group-item list-group-item-action">
                    <div class="d-flex w-100 justify-content-between">
                        <h5 class="mb-1">{app.student_user?.full_name || 'Unknown User'}</h5>
                        <small class="text-muted">{new Date(app.submitted_at).toLocaleDateString()}</small>
                    </div>
                    <div class="d-flex justify-content-between align-items-center">
                        <p class="mb-1 text-muted">
                            {app.courses?.name} 
                            {#if app.branches} - {app.branches.name}{/if}
                            <span class="badge bg-secondary ms-2">{app.form_type}</span>
                        </p>
                        <span class="badge 
                            {app.status === 'approved' ? 'bg-success' : 
                             app.status === 'verified' ? 'bg-info' : 
                             app.status === 'rejected' ? 'bg-danger' : 
                             app.status === 'submitted' ? 'bg-warning text-dark' : 'bg-secondary'}">
                            {app.status}
                        </span>
                    </div>
                </a>
            {:else}
                <div class="p-4 text-center text-muted">
                    No applications found.
                </div>
            {/each}
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
