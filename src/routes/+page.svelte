<script lang="ts">
    import { onMount } from 'svelte';
    import { fade } from 'svelte/transition';
<<<<<<< HEAD
<<<<<<< HEAD
=======
    import CrystalAnimation from '$lib/components/CrystalAnimation.svelte';
>>>>>>> test-branch
=======
    import CrystalAnimation from '$lib/components/CrystalAnimation.svelte';
>>>>>>> test-branch

    let { data } = $props();
</script>

<div class="landing-page">
<<<<<<< HEAD
<<<<<<< HEAD
=======
    <CrystalAnimation />
>>>>>>> test-branch
=======
    <CrystalAnimation />
>>>>>>> test-branch
    <div class="content container py-5">
        <div class="row align-items-center g-5">
            <!-- Welcome Section -->
            <div class="col-lg-6 text-center text-lg-start">
                <div class="p-4 p-md-5 mb-4 rounded-4 shadow-lg welcome-card">
<<<<<<< HEAD
<<<<<<< HEAD
                    <h1 class="display-4 fw-bold text-dark mb-3">University Admission Portal</h1>
                    <p class="fs-5 text-secondary mb-4">Your journey to academic excellence begins here. Join our community of scholars and innovators.</p>
=======
                    <h1 class="display-4 fw-bold text-dark mb-3">SVIT Admission Portal</h1>
                    <p class="fs-5 text-dark mb-4">Your journey to academic excellence begins here. Join our community of scholars and innovators.</p>
>>>>>>> test-branch
=======
                    <h1 class="display-4 fw-bold text-dark mb-3">SVIT Admission Portal</h1>
                    <p class="fs-5 text-dark mb-4">Your journey to academic excellence begins here. Join our community of scholars and innovators.</p>
>>>>>>> test-branch
                    <div class="d-flex flex-wrap justify-content-center justify-content-lg-start gap-3 mt-4">
                        <a href="/login" class="btn btn-primary btn-lg px-4 shadow-sm fw-bold">
                            <i class="bi bi-box-arrow-in-right me-2"></i> Login to Dashboard
                        </a>
                        <a href="/register" class="btn btn-outline-primary btn-lg px-4 fw-bold">
                            <i class="bi bi-person-plus me-2"></i> Create Account
                        </a>
                    </div>
                </div>
            </div>

            <!-- Inquiry Section -->
            <div class="col-lg-6">
                <div class="card border-0 rounded-4 shadow-lg overflow-hidden inquiry-panel">
                    <div class="card-header bg-white p-4 border-0">
                        <h3 class="fw-bold text-primary mb-1">Quick Inquiry</h3>
<<<<<<< HEAD
<<<<<<< HEAD
                        <p class="text-muted small mb-0">No login required to share your interest.</p>
=======
                        <p class="text-dark small mb-0">No login required to share your interest.</p>
>>>>>>> test-branch
=======
                        <p class="text-dark small mb-0">No login required to share your interest.</p>
>>>>>>> test-branch
                    </div>
                    <div class="card-body p-0">
                        <div class="list-group list-group-flush inquiry-list">
                            {#each data.inquiryForms as form}
                                <a href="/inquiry/{form.slug}" class="list-group-item list-group-item-action p-4 border-start-0 border-end-0 border-top">
                                    <div class="d-flex w-100 justify-content-between align-items-center">
                                        <h5 class="mb-1 fw-bold">{form.name}</h5>
                                        <span class="badge bg-primary rounded-pill">Start &rarr;</span>
                                    </div>
                                    {#if form.description}
<<<<<<< HEAD
<<<<<<< HEAD
                                        <p class="mb-2 text-muted small text-truncate">{form.description}</p>
=======
                                        <p class="mb-2 text-dark small text-truncate">{form.description}</p>
>>>>>>> test-branch
=======
                                        <p class="mb-2 text-dark small text-truncate">{form.description}</p>
>>>>>>> test-branch
                                    {/if}
                                    <div class="small text-primary fw-medium">
                                        <i class="bi bi-cursor-fill me-1"></i> Pre-select your courses
                                    </div>
                                </a>
                            {:else}
<<<<<<< HEAD
<<<<<<< HEAD
                                <div class="p-5 text-center text-muted">
                                    <i class="bi bi-info-circle display-6 d-block mb-3 opacity-25"></i>
=======
                                <div class="p-5 text-center text-dark">
                                    <i class="bi bi-info-circle display-6 d-block mb-3"></i>
>>>>>>> test-branch
=======
                                <div class="p-5 text-center text-dark">
                                    <i class="bi bi-info-circle display-6 d-block mb-3"></i>
>>>>>>> test-branch
                                    <p>Our counselors will be available for inquiries soon.</p>
                                </div>
                            {/each}
                        </div>
                    </div>
                    <div class="card-footer bg-light p-3 text-center border-0">
<<<<<<< HEAD
<<<<<<< HEAD
                        <span class="text-muted small">Already filled a form? Login to see your pre-filled profile.</span>
=======
                        <span class="text-dark small">Already filled a form? Login to see your pre-filled profile.</span>
>>>>>>> test-branch
=======
                        <span class="text-dark small">Already filled a form? Login to see your pre-filled profile.</span>
>>>>>>> test-branch
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<style lang="scss">
    .landing-page {
<<<<<<< HEAD
<<<<<<< HEAD
        background-image: url('https://images.unsplash.com/photo-1562774053-701939374585?w=1920&auto=format&fit=crop&q=80');
=======
        background-color: #0d6efd;
>>>>>>> test-branch
=======
        background-color: #0d6efd;
>>>>>>> test-branch
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        min-height: calc(100vh - 60px);
        position: relative;
        display: flex;
        align-items: center;
    }

    .overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
<<<<<<< HEAD
<<<<<<< HEAD
        background: linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(245,245,250,0.7) 100%);
=======
        background: transparent;
>>>>>>> test-branch
=======
        background: transparent;
>>>>>>> test-branch
        z-index: 1;
    }

    .content {
        position: relative;
        z-index: 2;
    }

    .welcome-card {
<<<<<<< HEAD
<<<<<<< HEAD
        background: rgba(255, 255, 255, 0.85) !important;
        backdrop-filter: blur(10px);
=======
        background: #ffffff !important;
        backdrop-filter: none;
>>>>>>> test-branch
=======
        background: #ffffff !important;
        backdrop-filter: none;
>>>>>>> test-branch
        border: 1px solid rgba(255, 255, 255, 0.5);
        box-shadow: 0 8px 32px rgba(0,0,0,0.1) !important;
    }

    .inquiry-panel {
<<<<<<< HEAD
<<<<<<< HEAD
        background: rgba(255, 255, 255, 0.85) !important;
        backdrop-filter: blur(10px);
=======
        background: #ffffff !important;
        backdrop-filter: none;
>>>>>>> test-branch
=======
        background: #ffffff !important;
        backdrop-filter: none;
>>>>>>> test-branch
        border: 1px solid rgba(255, 255, 255, 0.5);
    }

    .inquiry-list {
        max-height: 400px;
        overflow-y: auto;
    }

    .list-group-item {
        transition: all 0.2s;
        &:hover {
            background-color: rgba(13, 110, 253, 0.05);
            transform: translateX(5px);
        }
    }
</style>