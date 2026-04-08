<script lang="ts">
    import type { PageData } from './$types';

    export let data: PageData;

    const adminLinks = [
        { title: 'Manage Users', href: '/admin/users', icon: 'bi-people', desc: 'Create and manage system users.' },
        { title: 'Courses', href: '/admin/courses', icon: 'bi-book', desc: 'Manage courses offered by colleges.' },
        { title: 'Branches', href: '/admin/branches', icon: 'bi-diagram-3', desc: 'Manage course branches.' },
        { title: 'Academic Calendar', href: '/admin/academic-calendar', icon: 'bi-calendar-event', desc: 'Set up academic years and admission cycles.' },
        { title: 'Form Types', href: '/admin/form-types', icon: 'bi-tags', desc: 'Manage application form types and flags.' },
        { title: 'Student Profile Schema', href: '/admin/profile-schema', icon: 'bi-person-lines-fill', desc: 'Configure student profile fields.' },
        { title: 'Admission Forms', href: '/admin/forms', icon: 'bi-file-earmark-text', desc: 'Configure dynamic admission forms.' },
        { title: 'Admission Sequences', href: '/admin/admission-sequences', icon: 'bi-123', desc: 'Configure admission number sequences.' },
        { title: 'Fee Structures', href: '/admin/fee-structures', icon: 'bi-cash-coin', desc: 'Define fee structures for courses.' },
        { title: 'Merit Formulas', href: '/admin/merit-formulas', icon: 'bi-calculator', desc: 'Configure merit calculation logic.' },
        { title: 'Calculate Merit', href: '/admin/merit-calculation', icon: 'bi-lightning', desc: 'Run merit calculations.' },
        { title: 'Report Builder', href: '/admin/report-builder', icon: 'bi-tools', desc: 'Build and manage custom reports.' }
    ];
</script>

<div class="container-fluid">
    <h1 class="mb-4">Admin Dashboard</h1>
    <p class="lead">Welcome, {data.user?.full_name || data.user?.email}!</p>
    <hr class="mb-4" />

    <div class="row row-cols-1 row-cols-md-2 row-cols-lg-3 row-cols-xl-4 g-4">
        {#each adminLinks as link}
            <div class="col">
                <div class="card h-100 shadow-sm hover-card">
                    <div class="card-body text-center">
                        <div class="mb-3 text-primary">
                            <i class="bi {link.icon} display-4"></i>
                        </div>
                        <h5 class="card-title">
                            <a href={link.href} class="text-decoration-none stretched-link text-dark">{link.title}</a>
                        </h5>
                        <p class="card-text text-muted small">{link.desc}</p>
                    </div>
                </div>
            </div>
        {/each}
    </div>
</div>

<style>
    .hover-card:hover {
        transform: translateY(-5px);
        transition: transform 0.2s ease-in-out;
        background-color: #f8f9fa;
    }
</style>
