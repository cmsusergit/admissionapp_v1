<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance } from '$app/forms';
    import { writable } from 'svelte/store';
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';

    export let data: PageData;
    export let form: ActionData;

    let showCreateModal = false;
    let showEditModal = false;
    let showDeleteModal = false;
    let showResetPasswordModal = false; // New state

    let newUser = writable({
        email: '',
        password: '',
        role: 'student',
        full_name: '',
        university_id: '',
        college_id: ''
    });

    let currentUser = writable({
        id: '',
        email: '',
        role: 'student',
        university_id: '',
        college_id: '',
        full_name: ''
    });
    
    // New store for password reset
    let resetPasswordData = writable({
        id: '',
        email: '',
        newPassword: ''
    });

    // Roles list
    const roles = [
        'student',
        'admin',
        'deo',
        'college_auth',
        'university_auth',
        'adm_officer',
        'fee_collector'
    ];

    // Filter state
    let searchEmail = '';
    let filterRole = '';
    let filterUniversity = '';
    let filterCollege = '';

    // Filtered Users Logic
    $: filteredUsers = data.users.filter(user => {
        const matchEmail = user.email.toLowerCase().includes(searchEmail.toLowerCase());
        const matchRole = filterRole ? user.role === filterRole : true;
        const matchUniversity = filterUniversity ? user.university_id === filterUniversity : true;
        const matchCollege = filterCollege ? user.college_id === filterCollege : true;
        return matchEmail && matchRole && matchUniversity && matchCollege;
    });

    // Reactive college options for filter based on selected university
    $: filterCollegeOptions = filterUniversity
        ? data.colleges.filter(c => c.university_id === filterUniversity)
        : data.colleges;

    // Filter colleges based on selected university in Edit/Create Modal
    $: filteredColleges = $currentUser.university_id 
        ? data.colleges.filter(c => c.university_id === $currentUser.university_id)
        : [];
    
    $: filteredNewColleges = $newUser.university_id
        ? data.colleges.filter(c => c.university_id === $newUser.university_id)
        : [];

    function openCreateModal() {
        newUser.set({
            email: '',
            password: '',
            role: 'student',
            full_name: '',
            university_id: '',
            college_id: ''
        });
        showCreateModal = true;
    }

    function openEditModal(user: any) {
        currentUser.set({
            id: user.id,
            email: user.email,
            role: user.role,
            university_id: user.university_id || '',
            college_id: user.college_id || '',
            full_name: user.full_name || ''
        });
        showEditModal = true;
    }

    function openDeleteModal(user: any) {
        currentUser.set(user);
        showDeleteModal = true;
    }

    function openResetPasswordModal(user: any) {
        resetPasswordData.set({
            id: user.id,
            email: user.email,
            newPassword: ''
        });
        showResetPasswordModal = true;
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">Manage Users & Roles</h1>

    {#if form?.message}
        <div class="alert {form.error ? 'alert-danger' : 'alert-success'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <div class="d-flex justify-content-between align-items-center mb-3">
        <button class="btn btn-primary" on:click={openCreateModal}>Create New User</button>
    </div>

    <!-- Filters -->
    <div class="card mb-3">
        <div class="card-body">
            <div class="row g-3">
                <div class="col-md-3">
                    <label for="filter-email" class="form-label">Search Email</label>
                    <input type="text" class="form-control" id="filter-email" placeholder="name@example.com" bind:value={searchEmail}>
                </div>
                <div class="col-md-3">
                    <label for="filter-role" class="form-label">Filter by Role</label>
                    <select class="form-select" id="filter-role" bind:value={filterRole}>
                        <option value="">All Roles</option>
                        {#each roles as role}
                            <option value={role}>{role}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3">
                    <label for="filter-university" class="form-label">Filter by University</label>
                    <select class="form-select" id="filter-university" bind:value={filterUniversity}>
                        <option value="">All Universities</option>
                        {#each data.universities as uni}
                            <option value={uni.id}>{uni.name}</option>
                        {/each}
                    </select>
                </div>
                <div class="col-md-3">
                    <label for="filter-college" class="form-label">Filter by College</label>
                    <select class="form-select" id="filter-college" bind:value={filterCollege}>
                        <option value="">All Colleges</option>
                        {#each filterCollegeOptions as college}
                            <option value={college.id}>{college.name}</option>
                        {/each}
                    </select>
                </div>
            </div>
        </div>
    </div>

    <div class="card">
        <div class="card-body p-0">
            <div class="table-responsive">
                <table class="table table-striped table-hover mb-0">
                    <thead>
                        <tr>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Affiliation</th>
                            <th>Created At</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each filteredUsers as user}
                            <tr>
                                <td>
                                    {user.email}
                                    {#if user.full_name}<br><small class="text-muted">{user.full_name}</small>{/if}
                                </td>
                                <td><span class="badge bg-secondary">{user.role}</span></td>
                                <td>
                                    {#if user.colleges}
                                        {user.colleges.name}
                                    {:else if user.universities}
                                        {user.universities.name}
                                    {:else}
                                        -
                                    {/if}
                                </td>
                                <td>{new Date(user.created_at).toLocaleDateString()}</td>
                                <td>
                                    <button class="btn btn-sm btn-info me-2" on:click={() => openEditModal(user)}>Edit</button>
                                    <button class="btn btn-sm btn-warning me-2" on:click={() => openResetPasswordModal(user)}>Reset Pwd</button>
                                    <button class="btn btn-sm btn-danger" on:click={() => openDeleteModal(user)}>Delete</button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</div>

<!-- Create User Modal -->
<div class="modal" tabindex="-1" style="display: {showCreateModal ? 'block' : 'none'};">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Create New User</h5>
                <button type="button" class="btn-close" on:click={() => (showCreateModal = false)}></button>
            </div>
            <div class="modal-body">
                <form method="POST" action="?/createUser" use:enhance={() => { 
                    showCreateModal = false; 
                    startLoading(); 
                    return async ({update}) => {
                        await update();
                        stopLoading();
                    } 
                }}>
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label for="create-email" class="form-label">Email</label>
                            <input type="email" class="form-control" id="create-email" name="email" bind:value={$newUser.email} required />
                        </div>
                        <div class="col-md-6">
                            <label for="create-password" class="form-label">Password</label>
                            <input type="password" class="form-control" id="create-password" name="password" bind:value={$newUser.password} required />
                        </div>
                        <div class="col-md-12">
                            <label for="create-fullname" class="form-label">Full Name</label>
                            <input type="text" class="form-control" id="create-fullname" name="full_name" bind:value={$newUser.full_name} required />
                        </div>
                        <div class="col-md-6">
                            <label for="create-role" class="form-label">Role</label>
                            <select class="form-select" id="create-role" name="role" bind:value={$newUser.role} required>
                                {#each roles as role}
                                    <option value={role}>{role}</option>
                                {/each}
                            </select>
                        </div>
                    </div>

                    <!-- Affiliation Fields -->
                    {#if ['university_auth', 'college_auth', 'deo', 'adm_officer', 'fee_collector'].includes($newUser.role)}
                        <div class="row g-3 mt-2">
                            <div class="col-md-6">
                                <label for="create-university" class="form-label">University</label>
                                <select class="form-select" id="create-university" name="university_id" bind:value={$newUser.university_id}>
                                    <option value="">Select University (Global if empty)</option>
                                    {#each data.universities as uni}
                                        <option value={uni.id}>{uni.name}</option>
                                    {/each}
                                </select>
                            </div>
                            
                            {#if ['college_auth', 'deo', 'adm_officer', 'fee_collector'].includes($newUser.role)}
                                <div class="col-md-6">
                                    <label for="create-college" class="form-label">College</label>
                                    <select class="form-select" id="create-college" name="college_id" bind:value={$newUser.college_id} disabled={!$newUser.university_id}>
                                        <option value="">Select College (Global if empty)</option>
                                        {#each filteredNewColleges as college}
                                            <option value={college.id}>{college.name}</option>
                                        {/each}
                                    </select>
                                </div>
                            {/if}
                        </div>
                    {/if}

                    <div class="modal-footer mt-3">
                        <button type="button" class="btn btn-secondary" on:click={() => (showCreateModal = false)}>Close</button>
                        <button type="submit" class="btn btn-primary">Create User</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<!-- Edit Modal -->
<div class="modal" tabindex="-1" style="display: {showEditModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit User: {$currentUser.email}</h5>
                <button type="button" class="btn-close" on:click={() => (showEditModal = false)}></button>
            </div>
            <div class="modal-body">
                <form method="POST" action="?/updateRole" use:enhance={() => { 
                    showEditModal = false; 
                    startLoading(); 
                    return async ({update}) => {
                        await update();
                        stopLoading();
                    } 
                }}>
                    <input type="hidden" name="id" value={$currentUser.id} />
                    
                    <div class="mb-3">
                        <label for="edit-role" class="form-label">Role</label>
                        <select class="form-select" id="edit-role" name="role" bind:value={$currentUser.role} required>
                            {#each roles as role}
                                <option value={role}>{role}</option>
                            {/each}
                        </select>
                    </div>

                    <!-- Show University/College selection based on role -->
                    {#if ['university_auth', 'college_auth', 'deo', 'adm_officer', 'fee_collector'].includes($currentUser.role)}
                        <div class="mb-3">
                            <label for="edit-university" class="form-label">University</label>
                            <select class="form-select" id="edit-university" name="university_id" bind:value={$currentUser.university_id}>
                                <option value="">Select University (Global if empty)</option>
                                {#each data.universities as uni}
                                    <option value={uni.id}>{uni.name}</option>
                                {/each}
                            </select>
                        </div>
                    {/if}

                    {#if ['college_auth', 'deo', 'adm_officer', 'fee_collector'].includes($currentUser.role)}
                        <div class="mb-3">
                            <label for="edit-college" class="form-label">College</label>
                            <select class="form-select" id="edit-college" name="college_id" bind:value={$currentUser.college_id} disabled={!$currentUser.university_id}>
                                <option value="">Select College (Global if empty)</option>
                                {#each filteredColleges as college}
                                    <option value={college.id}>{college.name}</option>
                                {/each}
                            </select>
                        </div>
                    {/if}

                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" on:click={() => (showEditModal = false)}>Close</button>
                        <button type="submit" class="btn btn-primary">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<!-- Delete Modal -->
<div class="modal" tabindex="-1" style="display: {showDeleteModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete User</h5>
                <button type="button" class="btn-close" on:click={() => (showDeleteModal = false)}></button>
            </div>
            <form method="POST" action="?/deleteUser" use:enhance={() => { 
                showDeleteModal = false; 
                startLoading(); 
                return async ({update}) => {
                    await update();
                    stopLoading();
                } 
            }}>
                <div class="modal-body">
                    <input type="hidden" name="id" value={$currentUser.id} />
                    <p>Are you sure you want to delete user <strong>{$currentUser.email}</strong>?</p>
                    <p class="text-danger">This will remove their access and might affect related data.</p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" on:click={() => (showDeleteModal = false)}>Cancel</button>
                    <button type="submit" class="btn btn-danger">Delete</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Reset Password Modal -->
<div class="modal" tabindex="-1" style="display: {showResetPasswordModal ? 'block' : 'none'};">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Reset Password: {$resetPasswordData.email}</h5>
                <button type="button" class="btn-close" on:click={() => (showResetPasswordModal = false)}></button>
            </div>
            <div class="modal-body">
                <form method="POST" action="?/resetPassword" use:enhance={() => { 
                    showResetPasswordModal = false; 
                    startLoading(); 
                    return async ({update}) => {
                        await update();
                        stopLoading();
                    } 
                }}>
                    <input type="hidden" name="id" value={$resetPasswordData.id} />
                    <div class="mb-3">
                        <label for="new-password" class="form-label">New Password</label>
                        <input type="password" class="form-control" id="new-password" name="newPassword" bind:value={$resetPasswordData.newPassword} required minlength="6" />
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" on:click={() => (showResetPasswordModal = false)}>Cancel</button>
                        <button type="submit" class="btn btn-warning">Reset Password</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<style>
    .modal {
        background-color: rgba(0, 0, 0, 0.5);
    }
</style>