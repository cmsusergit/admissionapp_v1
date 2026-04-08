<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { enhance, deserialize } from '$app/forms'; // Import deserialize
    import { goto } from '$app/navigation';
    import { onMount } from 'svelte';
    import DynamicForm from '$lib/components/DynamicForm.svelte';
    import { supabase } from '$lib/supabase'; // Client-side supabase client
    import { startLoading, stopLoading } from '$lib/stores/loadingStore'; // Import loading controls

    export let data: PageData;
    export let form: ActionData; // To get messages from form actions

    let studentSearchContainer: HTMLElement;

    onMount(() => {
        function handleClickOutside(event: MouseEvent) {
            if (studentSearchContainer && !studentSearchContainer.contains(event.target as Node)) {
                isStudentListExpanded = false;
            }
        }
        document.addEventListener('click', handleClickOutside);
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    });

    let selectedStudentId: string = data.selectedStudent?.id || '';
    let showCreateStudentForm = false;

    let selectedCourseId: string = data.selectedCourse?.id || '';
    let selectedCycleId: string = '';
    let selectedBranchId: string = ''; // Branch Selection
    let selectedFormType: string = 'Provisional'; // Form Type Selection
    
    let currentApplicationId: string | null = null;
    let applicationFormData: Record<string, any> = {};

    let currentAdmissionFormSchema: any = null;
    let isLoadingSchema = false;
    let loadedStudentProfile: any = null; // Store fetched student profile

    // Profile Editing State
    let showEditProfileModal = false;
    let profileFormSchema: any = null;
    let profileFormData: Record<string, any> = {};
    let profileForm: DynamicForm;

    // New student form fields
    let newStudentFullName = '';
    let newStudentEmail = '';
    let newStudentPassword = '';
    let newStudentConfirmPassword = '';

    // Function to generate a random password
    
    // Convert raw profile schema to DynamicForm schema format
    $: if (data.profileSchema) {
        profileFormSchema = {
            fields: data.profileSchema.map((field: any) => {
                let parsedOptions = undefined;
                if (field.options && Array.isArray(field.options) && field.options.length > 0) {
                    parsedOptions = field.options.map((opt: any) => {
                        if (typeof opt === 'string' && opt.includes('|')) {
                            const [val, lbl] = opt.split('|');
                            return { value: val.trim(), label: lbl.trim() };
                        }
                        // Handle case where it might already be an object (though DB seems to store strings)
                        if (typeof opt === 'object' && opt.value) return opt;
                        return { value: opt, label: opt };
                    });
                }

                return {
                    key: field.key,
                    label: field.label,
                    type: field.type,
                    required: field.is_required,
                    // Use dataSource for structured options to avoid DynamicForm re-mapping string[]
                    dataSource: parsedOptions ? {
                        type: 'static',
                        options: parsedOptions
                    } : undefined,
                    col: 12
                };
            })
        };
    }

    // Search state
    let studentSearchTerm = '';
    let isStudentListExpanded = false;

    // Helper to merge profile data into form data based on schema
    function mergeProfileData(formData: any, schema: any, profileData: any) {
        if (!schema || !schema.fields || !profileData) return formData;
        
        console.log('Merging Profile Data:', profileData);
        const merged = { ...formData };
        
        schema.fields.forEach((field: any) => {
            let profileVal = undefined;
            let source = '';

            // 1. Try explicit profile mapping
            if (field.profileFieldKey && profileData[field.profileFieldKey] !== undefined) {
                profileVal = profileData[field.profileFieldKey];
                source = `profileFieldKey: ${field.profileFieldKey}`;
            }
            // 2. Try implicit key matching
            else if (profileData[field.key] !== undefined) {
                profileVal = profileData[field.key];
                source = `key: ${field.key}`;
            }

            // Apply if we found a value (even if it overwrites)
            if (profileVal !== undefined && profileVal !== null && profileVal !== '') {
                console.log(`Field [${field.key}]: Merging '${profileVal}' from ${source}`);
                merged[field.key] = profileVal;
            }
        });
        return merged;
    }

    $: console.log('Client-side disableBranchSelection:', data.disableBranchSelection);

    // Reactive: Determine if branch selection should be disabled based on currently loaded schema
    // Property is 'enableBranchSelection'. If missing or false, it's disabled.
    $: isBranchSelectionDisabled = currentAdmissionFormSchema ? !currentAdmissionFormSchema.enableBranchSelection : data.disableBranchSelection;

    // Reactive: Get branches for the selected course
    $: branchesForSelectedCourse = selectedCourseId 
        ? data.courses.find(c => c.id === selectedCourseId)?.branches || []
        : [];

    // Reactive: Reset branch if course changes or if branch selection is disabled
    $: if (selectedCourseId) {
        if (selectedBranchId && (!branchesForSelectedCourse.some(b => b.id === selectedBranchId) || isBranchSelectionDisabled)) {
            selectedBranchId = '';
        }
    }

    // Reactive: Auto-select active cycle if none selected
    $: if (!selectedCycleId && data.availableCycles.length > 0) {
        selectedCycleId = data.availableCycles[0].id;
    }

    // Reactive: Filtered students based on search term
    $: filteredStudents = data.students.filter(student => {
        if (!studentSearchTerm) return true;
        const term = studentSearchTerm.toLowerCase();
        return (student.full_name?.toLowerCase().includes(term) || 
                student.email?.toLowerCase().includes(term));
    });

    // Reactive statement to fetch form schema, student profile, and check for existing application
    $: {
        if (selectedStudentId) {
             // If student changes, fetch their profile
             if (!loadedStudentProfile || loadedStudentProfile.user_id !== selectedStudentId) {
                 fetchStudentProfile(selectedStudentId);
             }
        } else {
            loadedStudentProfile = null;
        }

        if (selectedCourseId && selectedCycleId && selectedFormType) {
            loadSchemaAndCheckApp();
        } else {
            currentAdmissionFormSchema = null;
        }
    }

    async function fetchStudentProfile(studentId: string) {
        try {
            const response = await fetch(`/api/deo/get-student-profile?student_id=${studentId}`);
            if (response.ok) {
                const result = await response.json();
                loadedStudentProfile = result.profile;
                // If we have a form loaded, re-merge
                if (currentAdmissionFormSchema) {
                    applicationFormData = mergeProfileData(applicationFormData, currentAdmissionFormSchema, loadedStudentProfile?.profile_data);
                }
            }
        } catch (e) {
            console.error('Failed to fetch student profile', e);
        }
    }

    async function loadSchemaAndCheckApp() {
        await fetchAdmissionFormSchema(selectedCourseId, selectedCycleId, selectedFormType);
        
        // Explicitly pre-fill form data from profile as soon as schema is loaded
        if (currentAdmissionFormSchema && loadedStudentProfile) {
            applicationFormData = mergeProfileData(applicationFormData, currentAdmissionFormSchema, loadedStudentProfile.profile_data);
        }

        // Only check for existing app if we have a student selected AND (branch is selected OR no branches available OR branch selection is disabled)
        if (selectedStudentId && (!branchesForSelectedCourse.length || selectedBranchId || isBranchSelectionDisabled)) {
             await checkExistingApplication();
        }
    }

    async function checkExistingApplication() {
        // If we are already editing an app matching these criteria, do nothing?
        // No, if the user CHANGED criteria (e.g. branch), we must switch context.
        
        startLoading();
        
        let query = supabase
            .from('applications')
            .select('id, form_data, branch_id, form_type, status')
            .eq('student_id', selectedStudentId)
            .eq('course_id', selectedCourseId)
            .eq('cycle_id', selectedCycleId)
            .eq('form_type', selectedFormType);

        if (selectedBranchId) {
            query = query.eq('branch_id', selectedBranchId);
        } else {
            query = query.is('branch_id', null);
        }

        const { data: existingApp, error } = await query.maybeSingle();

        if (error) {
            console.error('Error checking for existing application:', error.message);
        } else if (existingApp) {
            // Found existing application -> Switch to Edit Mode
            console.log('Found existing application:', existingApp.id);
            currentApplicationId = existingApp.id;
            
            // Merge profile data even for existing apps (live update of mapped fields)
            applicationFormData = mergeProfileData(
                existingApp.form_data || {}, 
                currentAdmissionFormSchema, 
                loadedStudentProfile?.profile_data
            );
        } else {
            // No existing application -> Switch to Create Mode (New Draft)
            // If currentApplicationId WAS set, and now we found nothing, it means we switched to a new unique combo.
            if (currentApplicationId) {
                currentApplicationId = null;
                applicationFormData = {}; // Reset form for new entry
            }
            // Auto-fill new form
            applicationFormData = mergeProfileData(
                applicationFormData, 
                currentAdmissionFormSchema, 
                loadedStudentProfile?.profile_data
            );
        }
        
        stopLoading();
    }

    onMount(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const appId = urlParams.get('applicationId');
        if (appId) {
            currentApplicationId = appId;
            await fetchExistingApplication(appId);
        }
        
        // Initialize search term if student is pre-selected
        if (selectedStudentId) {
            const student = data.students.find(s => s.id === selectedStudentId);
            if (student) {
                studentSearchTerm = `${student.full_name} (${student.email})`;
            }
        }
    });

    function selectStudent(student: any) {
        selectedStudentId = student.id;
        studentSearchTerm = `${student.full_name} (${student.email})`;
        isStudentListExpanded = false;
    }

    function clearStudentSelection() {
        selectedStudentId = '';
        studentSearchTerm = '';
        isStudentListExpanded = true;
        loadedStudentProfile = null;
    }

    function openEditProfile() {
        if (!selectedStudentId) return;
        // Populate profile form data from loaded profile
        profileFormData = loadedStudentProfile?.profile_data || {};
        showEditProfileModal = true;
    }

    async function handleUpdateProfile() {
        if (profileForm && !profileForm.validate()) {
            alert('Please fill in all required profile fields.');
            return;
        }

        startLoading();
        const formData = new FormData();
        formData.append('student_id', selectedStudentId);
        formData.append('profile_data', JSON.stringify(profileFormData));

        try {
            const response = await fetch('?/updateStudentProfile', {
                method: 'POST',
                body: formData
            });
            const result = deserialize(await response.text());
            
            if (result.type === 'success') {
                alert('Profile updated successfully!');
                showEditProfileModal = false;
                // Refresh profile data and re-merge
                await fetchStudentProfile(selectedStudentId);
            } else {
                alert(result.data?.message || 'Failed to update profile.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred.');
        } finally {
            stopLoading();
        }
    }

    async function fetchAdmissionFormSchema(courseId: string, cycleId: string, formType: string) {
        isLoadingSchema = true;
        startLoading(); // Show overlay while fetching schema
        // Fetch specific schema for type
        const { data: formResult, error } = await supabase
            .from('admission_forms')
            .select('schema_json')
            .eq('course_id', courseId)
            .eq('cycle_id', cycleId)
            .eq('form_type', formType)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error fetching admission form schema:', error.message);
            currentAdmissionFormSchema = null;
        } else if (formResult) {
            currentAdmissionFormSchema = formResult.schema_json;
        } else {
            if (formType !== 'Provisional') {
                 const { data: defaultForm, error: defaultError } = await supabase
                    .from('admission_forms')
                    .select('schema_json')
                    .eq('course_id', courseId)
                    .eq('cycle_id', cycleId)
                    .eq('form_type', 'Provisional')
                    .limit(1)
                    .maybeSingle();
                
                if (defaultForm) {
                    console.warn(`No schema found for ${formType}, using Provisional schema.`);
                    currentAdmissionFormSchema = defaultForm.schema_json;
                } else {
                    currentAdmissionFormSchema = null;
                }
            } else {
                currentAdmissionFormSchema = null;
            }
        }
        isLoadingSchema = false;
        stopLoading(); // Hide overlay
    }

    async function fetchExistingApplication(appId: string) {
        const { data: application, error } = await supabase
            .from('applications')
            .select('form_data, course_id, cycle_id, branch_id, form_type, student_id')
            .eq('id', appId)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error fetching existing application:', error.message);
        } else if (application) {
            selectedStudentId = application.student_id;
            selectedCourseId = application.course_id;
            selectedCycleId = application.cycle_id;
            selectedBranchId = application.branch_id || '';
            selectedFormType = application.form_type || 'Provisional';
            applicationFormData = application.form_data || {};

            // Update search box display
            const student = data.students.find(s => s.id === selectedStudentId);
            if (student) {
                studentSearchTerm = `${student.full_name} (${student.email})`;
            }
        }
    }

    let dynamicForm: DynamicForm;

    async function handleSaveDraft() {
        if (!selectedStudentId) {
            alert('Please select or create a student first.');
            return;
        }
        
        if (branchesForSelectedCourse.length > 0 && !selectedBranchId) {
            alert('Please select a Branch for this course.');
            return;
        }

        const formPayload = new FormData();
        formPayload.append('student_id', selectedStudentId);
        formPayload.append('course_id', selectedCourseId);
        formPayload.append('cycle_id', selectedCycleId);
        formPayload.append('form_type', selectedFormType);
        if (selectedBranchId) {
             formPayload.append('branch_id', selectedBranchId);
        }
        formPayload.append('form_data', JSON.stringify(applicationFormData));
        if (currentApplicationId) {
            formPayload.append('application_id', currentApplicationId);
        }

        const response = await fetch('?/saveApplication', {
            method: 'POST',
            body: formPayload
        });

        const result = deserialize(await response.text());
        if (result.type === 'success' && result.data?.success) {
            console.log(result.data.message);
            if (!currentApplicationId && result.data.applicationId) {
                await goto(`/deo/apply?studentId=${selectedStudentId}&applicationId=${result.data.applicationId}`, { replaceState: true });
                currentApplicationId = result.data.applicationId;
            }
        } else {
            console.error('Failed to save draft:', result);
        }
    }

    async function handleSubmitApplication() {
        if (!currentApplicationId || !selectedStudentId) {
            alert('Cannot submit without saving as draft first and selecting a student.');
            return;
        }

        if (branchesForSelectedCourse.length > 0 && !selectedBranchId) {
            alert('Please select a Branch for this course.');
            return;
        }

        if (dynamicForm && !dynamicForm.validate()) {
            alert('Please fill in all required fields.');
            return;
        }

        startLoading(); // Start loading overlay

        try {
            await handleSaveDraft();

            const formPayload = new FormData();
            formPayload.append('student_id', selectedStudentId);
            formPayload.append('application_id', currentApplicationId);

            const response = await fetch('?/submitApplication', {
                method: 'POST',
                body: formPayload
            });

            const result = deserialize(await response.text());
            if (result.type === 'success' && result.data?.success) {
                console.log(result.data.message);
                if (result.data.feeStatus === 'pending' && result.data.feeAmount > 0) {
                    // Show payment modal instead of redirecting immediately
                    if (confirm(`Application Submitted. Fee of ₹${result.data.feeAmount} is pending. Record payment now?`)) {
                        // Open modal or just redirect to a payment page?
                        // For simplicity in this iteration, let's redirect to dashboard but maybe with a flag.
                        // Or better, implement the modal right here.
                        // Let's implement the modal.
                        currentFeeAmount = result.data.feeAmount;
                        showPaymentModal = true;
                    } else {
                        await goto('/deo/dashboard');
                    }
                } else {
                    await goto('/deo/dashboard'); 
                }
            } else {
                console.error('Submission failed:', result);
                alert('Submission failed. Please try again.'); // User feedback
            }
        } catch (error) {
            console.error('An error occurred:', error);
            alert('An unexpected error occurred.');
        } finally {
            stopLoading(); // Ensure overlay is hidden
        }
    }

    // Payment Logic
    let showPaymentModal = false;
    let currentFeeAmount = 0;
    let paymentMode = 'cash';
    let transactionRef = '';

    async function handleRecordPayment() {
        if (!currentApplicationId) return;
        startLoading();
        const formData = new FormData();
        formData.append('application_id', currentApplicationId);
        formData.append('amount', currentFeeAmount.toString());
        formData.append('payment_mode', paymentMode);
        formData.append('transaction_ref', transactionRef || `OFFLINE-${Date.now()}`);

        const response = await fetch('?/recordPayment', {
            method: 'POST',
            body: formData
        });
        const result = deserialize(await response.text());
        stopLoading();

        if (result.type === 'success') {
            alert('Payment recorded successfully!');
            showPaymentModal = false;
            await goto('/deo/dashboard');
        } else {
            alert('Failed to record payment.');
        }
    }

    async function handleDeleteDraft() {
        if (!currentApplicationId) return;
        
        if (!confirm('Are you sure you want to delete this draft? This action cannot be undone.')) {
            return;
        }

        startLoading();
        const formData = new FormData();
        formData.append('application_id', currentApplicationId);

        const response = await fetch('?/deleteDraft', {
            method: 'POST',
            body: formData
        });
        const result = deserialize(await response.text());
        stopLoading();

        if (result.type === 'success') {
            alert('Draft deleted successfully.');
            await goto('/deo/dashboard');
        } else {
            alert(result.data?.message || 'Failed to delete draft.');
        }
    }
</script>

<div class="container-fluid">
    <h1 class="mb-4">DEO: Apply on Behalf</h1>

    {#if form?.message}
        <div class="alert {form.error ? 'alert-danger' : 'alert-success'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <!-- Student Selection -->
    <div class="card mb-4">
        <div class="card-body">
            <h5 class="card-title">Select or Create Student</h5>
            
            <div class="mb-3 position-relative" bind:this={studentSearchContainer}>
                <label for="student-search" class="form-label">Search Student</label>
                <div class="input-group">
                    <input 
                        type="text" 
                        class="form-control" 
                        id="student-search" 
                        placeholder="Type name or email..." 
                        bind:value={studentSearchTerm}
                        on:focus={() => isStudentListExpanded = true}
                        disabled={!!currentApplicationId}
                        autocomplete="off"
                    />
                    {#if selectedStudentId && !currentApplicationId}
                        <button class="btn btn-outline-secondary" type="button" on:click={clearStudentSelection}>
                            <i class="bi bi-x-lg"></i> Clear
                        </button>
                    {/if}
                </div>
                
                {#if isStudentListExpanded && !selectedStudentId && !currentApplicationId}
                    <div class="list-group position-absolute w-100 shadow" style="z-index: 1000; max-height: 200px; overflow-y: auto;">
                        {#each filteredStudents as student}
                            <button 
                                type="button" 
                                class="list-group-item list-group-item-action" 
                                on:click={() => selectStudent(student)}
                            >
                                {student.full_name} <small class="text-muted">({student.email})</small>
                            </button>
                        {:else}
                            <div class="list-group-item text-muted">No students found matching "{studentSearchTerm}"</div>
                        {/each}
                    </div>
                {/if}
                
                {#if currentApplicationId}
                    <div class="form-text">Student cannot be changed while editing an existing application.</div>
                {/if}
            </div>
            
            {#if !currentApplicationId}
                <button class="btn btn-secondary" on:click={() => (showCreateStudentForm = !showCreateStudentForm)}>
                    {#if showCreateStudentForm}Hide Create Student Form{:else}Create New Student{/if}
                </button>
            {/if}

            {#if showCreateStudentForm && !currentApplicationId}
                <div class="card mt-3 p-3">
                    <h6 class="card-subtitle mb-2 text-muted">New Student Details</h6>
                    <form method="POST" action="?/createStudent" use:enhance={() => { return async ({ update, result }) => {
                        if (result.type === 'success' && result.data?.studentId) {
                            // If successful, reset local form fields
                            newStudentFullName = '';
                            newStudentEmail = '';
                            newStudentPassword = '';
                            newStudentConfirmPassword = '';

                            handleStudentCreated({ target: document.getElementById('create-student-form') } as any);
                        }
                        await update();
                    }}} id="create-student-form">
                        <div class="mb-3">
                            <label for="new-student-full-name" class="form-label">Full Name</label>
                            <input type="text" class="form-control" id="new-student-full-name" name="full_name" required bind:value={newStudentFullName} />
                        </div>
                        <div class="mb-3">
                            <label for="new-student-email" class="form-label">Email</label>
                            <input type="email" class="form-control" id="new-student-email" name="email" required bind:value={newStudentEmail} />
                        </div>
                        <div class="mb-3">
                            <label for="new-student-password" class="form-label">Password</label>
                            <input type="password" class="form-control" id="new-student-password" name="password" required bind:value={newStudentPassword} />
                        </div>
                        <div class="mb-3">
                            <label for="new-student-confirm-password" class="form-label">Confirm Password</label>
                            <input type="password" class="form-control" id="new-student-confirm-password" name="confirm_password" required bind:value={newStudentConfirmPassword} />
                        </div>
                        <button type="submit" class="btn btn-primary">Create Student</button>

                </div>
            {/if}
        </div>
    </div>

    <!-- Application Form Area -->
    {#if selectedStudentId}
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h3 class="mb-0">Application for: {studentSearchTerm}</h3>
            <button class="btn btn-outline-primary btn-sm" on:click={openEditProfile}>
                <i class="bi bi-person-lines-fill"></i> Edit Student Profile
            </button>
        </div>

        <div class="card mb-4">
            <div class="card-body">
                <h5 class="card-title">Application Details</h5>
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label for="course-select" class="form-label">Course</label>
                        <select class="form-select" id="course-select" bind:value={selectedCourseId} disabled={!!currentApplicationId}>
                            <option value="">Select a Course</option>
                            {#each data.courses as course}
                                <option value={course.id}>{course.name} ({course.colleges?.name})</option>
                            {/each}
                        </select>
                    </div>

                    <div class="col-md-6 mb-3">
                        <label for="cycle-select" class="form-label">Admission Cycle</label>
                        <select class="form-select" id="cycle-select" bind:value={selectedCycleId} disabled={!!currentApplicationId}>
                            <option value="">Select an Admission Cycle</option>
                            {#each data.availableCycles as cycle}
                                <option value={cycle.id}>{cycle.name} ({cycle.academic_years?.name})</option>
                            {/each}
                        </select>
                    </div>
                </div>

                <div class="row">
                    <!-- Form Type Selection -->
                    <div class="col-md-6 mb-3">
                        <label for="form-type-select" class="form-label">Form Type</label>
                        <select class="form-select" id="form-type-select" bind:value={selectedFormType}>
                            {#if data.formTypes}
                                {#each data.formTypes as ft}
                                    <option value={ft.name}>{ft.name}</option>
                                {/each}
                            {:else}
                                <option value="Provisional">Provisional</option>
                            {/if}
                        </select>
                    </div>

                    <!-- Branch Selection -->
                    {#if branchesForSelectedCourse.length > 0 && !isBranchSelectionDisabled}
                        <div class="col-md-6 mb-3">
                            <label for="branch-select" class="form-label">Branch</label>
                            <select class="form-select" id="branch-select" bind:value={selectedBranchId}>
                                <option value="">Select a Branch</option>
                                {#each branchesForSelectedCourse as branch}
                                    <option value={branch.id}>{branch.name} {branch.code ? `(${branch.code})` : ''}</option>
                                {/each}
                            </select>
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        {#if selectedCourseId && selectedCycleId}
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Application Form ({selectedFormType})</h5>
                    {#if isLoadingSchema}
                        <div class="text-center p-3">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                        </div>
                    {:else if currentAdmissionFormSchema && currentAdmissionFormSchema.fields && currentAdmissionFormSchema.fields.length > 0}
                        <DynamicForm 
                            schema={currentAdmissionFormSchema} 
                            bind:formData={applicationFormData} 
                            bind:this={dynamicForm}
                        />
                        <div class="mt-3">
                            <button class="btn btn-secondary me-2" on:click={handleSaveDraft}>Save as Draft</button>
                            <button class="btn btn-success" on:click={handleSubmitApplication} disabled={!currentApplicationId}>Submit Application</button>
                            {#if currentApplicationId}
                                <button class="btn btn-danger float-end" on:click={handleDeleteDraft}>Delete Draft</button>
                            {/if}
                        </div>
                    {:else}
                        <div class="alert alert-warning">
                            No admission form configuration found for <strong>{selectedFormType}</strong> in the selected course/cycle. 
                            Please contact the administrator to create a form for this seat type.
                        </div>
                    {/if}
                </div>
            </div>
        {:else}
            <p class="text-info">Please select a Course and an Admission Cycle to view the application form.</p>
        {/if}
    {:else}
        <p class="text-info">Please select or create a student to proceed with application.</p>
    {/if}
</div>

<!-- Payment Modal -->
<div class="modal" tabindex="-1" style="display: {showPaymentModal ? 'block' : 'none'}; background-color: rgba(0,0,0,0.5);">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Record Payment</h5>
                <button type="button" class="btn-close" on:click={() => (showPaymentModal = false)}></button>
            </div>
            <div class="modal-body">
                <p>Application Submitted. Please record the payment.</p>
                <h4 class="text-primary mb-3">Amount: ₹ {currentFeeAmount}</h4>
                
                <div class="mb-3">
                    <label class="form-label">Payment Mode</label>
                    <select class="form-select" bind:value={paymentMode}>
                        <option value="cash">Cash</option>
                        <option value="cheque">Cheque</option>
                        <option value="online_transfer">Online Transfer (Reference)</option>
                    </select>
                </div>
                
                <div class="mb-3">
                    <label class="form-label">Reference / Receipt No.</label>
                    <input type="text" class="form-control" bind:value={transactionRef} placeholder="Enter receipt no..." />
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" on:click={() => (showPaymentModal = false)}>Close</button>
                <button type="button" class="btn btn-success" on:click={handleRecordPayment}>Record Payment</button>
            </div>
        </div>
    </div>
</div>

<!-- Edit Profile Modal -->
<div class="modal" tabindex="-1" style="display: {showEditProfileModal ? 'block' : 'none'}; background-color: rgba(0,0,0,0.5);">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Edit Student Profile</h5>
                <button type="button" class="btn-close" on:click={() => (showEditProfileModal = false)}></button>
            </div>
            <div class="modal-body">
                {#if profileFormSchema && profileFormSchema.fields.length > 0}
                    <DynamicForm 
                        schema={profileFormSchema} 
                        bind:formData={profileFormData} 
                        bind:this={profileForm}
                    />
                {:else}
                    <p class="text-muted">No profile fields defined in the system.</p>
                {/if}
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" on:click={() => (showEditProfileModal = false)}>Cancel</button>
                <button type="button" class="btn btn-primary" on:click={handleUpdateProfile}>Save Profile</button>
            </div>
        </div>
    </div>
</div>