<script lang="ts">
    import { PUBLIC_SUPABASE_URL } from '$env/static/public';
    import { goto } from '$app/navigation';
    
    export let university: { name: string, logo_url?: string } | null;
    export let hidden: boolean = false;
    export let userProfile: any = null;
    export let avatarUrl: string | null = null;

    function handleLogout() {
        goto('/logout', { method: 'POST' });
    }
</script>

<header class="app-header border-bottom bg-white {hidden ? 'header-hidden' : ''}">
    <div class="container-fluid d-flex align-items-center justify-content-between h-100">
        <div class="d-flex align-items-center">
            {#if university}
                {#if university.logo_url}
                    <img src={university.logo_url} alt="University Logo" class="university-logo me-3">
                {/if}
                <h1 class="h5 m-0 text-primary fw-bold">{university.name}</h1>
            {:else}
                <h1 class="h5 m-0 text-primary fw-bold">Admission Portal</h1>
            {/if}
        </div>
        
        {#if userProfile}
            <div class="dropdown">
                <button 
                    class="btn d-flex align-items-center p-0 dropdown-toggle" 
                    type="button" 
                    id="dropdownUser" 
                    data-bs-toggle="dropdown" 
                    aria-expanded="false"
                >
                    <span class="me-2 text-muted small d-none d-md-block">{userProfile.full_name || userProfile.email}</span>
                    {#if avatarUrl}
                        <img src="{PUBLIC_SUPABASE_URL}/storage/v1/object/public/documents/{avatarUrl}" alt="Profile" class="rounded-circle border" style="width: 36px; height: 36px; object-fit: cover;">
                    {:else}
                        <div class="rounded-circle bg-secondary text-white d-flex align-items-center justify-content-center" style="width: 36px; height: 36px;">
                            <i class="bi bi-person-fill"></i>
                        </div>
                    {/if}
                </button>
                <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="dropdownUser">
                    <li><h6 class="dropdown-header">{userProfile.full_name || userProfile.email}</h6></li>
                    <li><button class="dropdown-item text-danger" on:click={handleLogout}>Logout</button></li>
                </ul>
            </div>
        {/if}
    </div>
</header>

<style>
    .app-header {
        height: 60px; /* Fixed height for header */
        flex-shrink: 0;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 1040;
        transform: translateY(0);
        transition: transform 0.3s ease-out;
    }
    .app-header.header-hidden {
        transform: translateY(-100%);
    }
    .university-logo {
        height: 40px;
        width: auto;
        object-fit: contain;
    }
    .dropdown-menu {
        /* Ensure dropdown is positioned correctly */
        position: absolute;
        inset: 0 auto auto 0;
        transform: translate3d(-100px, 40px, 0px); /* Adjust as needed */
    }
    .dropdown-toggle::after {
        display: none; /* Hide default dropdown arrow */
    }
</style>
