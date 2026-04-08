<script>
    import { onMount } from 'svelte';
    import { goto } from '$app/navigation';
    import { supabase } from '$lib/supabase';

    // Removed auto-reload onMount to prevent redirect loops after logout
</script>

<div class="landing-page">
    <div class="overlay"></div>
    <div class="content container text-center">
        <div class="p-5 mb-4 rounded-3 shadow-lg" style="background-color: rgba(0, 0, 0, 0.5); backdrop-filter: blur(10px); border-radius: 1rem; border: 1px solid rgba(255,255,255,0.1);">
            <div class="container-fluid py-5">
                <h1 class="display-5 fw-bold text-white">University Admission Portal</h1>
                <p class="col-md-8 fs-4 mx-auto text-white-50">Welcome to the centralized admission system. Please login to continue to your dashboard.</p>
                <div class="d-flex justify-content-center gap-3 mt-4">
                    <a href="/login" class="btn btn-primary btn-lg px-4 gap-3">Login</a>
                    <a href="/register" class="btn btn-outline-light btn-lg px-4">Register</a>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
    .landing-page {
        background-image: url('https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=1920&auto=format&fit=crop');
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        min-height: calc(100vh - 60px); /* Subtract header height if visible, or 100vh */
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.6); /* Dark overlay for contrast */
        z-index: 1;
    }

    .content {
        position: relative;
        z-index: 2;
    }
</style>