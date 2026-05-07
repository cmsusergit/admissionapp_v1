<script lang="ts">
    import { onMount } from 'svelte';

    export let showModal = false;

    let modalElement: HTMLElement; // Reference to the modal DOM element

    onMount(async () => {
        if (typeof window !== 'undefined' && !(window as any).bootstrap) {
            await import('bootstrap');
        }

        if (typeof window !== 'undefined' && (window as any).bootstrap && modalElement) {
            const modal = new (window as any).bootstrap.Modal(modalElement);
            // This is primarily for showing/hiding. The Accordion itself relies on data-bs attributes.
            // The accordion data-bs-parent="#helpAccordion" is the key for single-open behavior.
            // Let's ensure the JS has a chance to bind.
            
            // Re-initialize all accordions within the modal
            modalElement.querySelectorAll('.accordion').forEach((accordionEl: Element) => {
                new (window as any).bootstrap.Collapse(accordionEl, {
                    toggle: false // Don't toggle initially, let 'show' class handle first open
                });
            });
        }
    });

    function closeModal() {
        showModal = false;
    }
</script>

{#if showModal}
<div class="modal d-block" tabindex="-1" style="background-color: rgba(0,0,0,0.5); z-index: 1050;" bind:this={modalElement}>
    <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header bg-light">
                <h5 class="modal-title">
                    <i class="bi bi-info-circle text-primary me-2"></i>
                    HTML Profile Template Guide & Variables
                </h5>
                <button type="button" class="btn-close" aria-label="Close" on:click={closeModal}></button>
            </div>
            <div class="modal-body">
                <p>
                    When creating a <strong>Custom Profile Form (HTML)</strong>, you can design the exact layout using standard HTML and inline CSS (e.g., <code>&lt;div style="..."&gt;</code>, <code>&lt;table border="1"&gt;</code>).
                </p>
                <p>
                    To inject student data dynamically, use Handlebars-style placeholders: <code>&lbrace;&lbrace;category.field&rbrace;&rbrace;</code>.
                    <br>Below is the comprehensive list of variable categories and how to map them.
                </p>

                <div class="accordion" id="helpAccordion">
                    
                    <!-- Student Profile Variables -->
                    <div class="accordion-item">
                        <h2 class="accordion-header" id="headingStudent">
                            <button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#collapseStudent" aria-expanded="true" aria-controls="collapseStudent">
                                <strong>1. Student Details (student.*)</strong>
                            </button>
                        </h2>
                        <div id="collapseStudent" class="accordion-collapse collapse show" aria-labelledby="headingStudent" data-bs-parent="#helpAccordion">
                            <div class="accordion-body">
                                <p class="small text-muted">Core user data and all custom fields defined in your Student Profile Schema.</p>
                                <ul>
                                    <li><code>&lbrace;&lbrace;student.full_name&rbrace;&rbrace;</code> - Full Name</li>
                                    <li><code>&lbrace;&lbrace;student.email&rbrace;&rbrace;</code> - Email Address</li>
                                    <li><code>&lbrace;&lbrace;student.enrollment_number&rbrace;&rbrace;</code> - College Enrollment ID</li>
                                    <li><code>&lbrace;&lbrace;student.photo_url&rbrace;&rbrace;</code> - Link to uploaded photo</li>
                                </ul>
                                <strong>Dynamic Profile Schema Fields:</strong>
                                <p class="small">Any field you created in the "Profile Schema" is accessible using its exact 'Key'. For example, if you created a Date of Birth field with the key <code>dob</code>:</p>
                                <ul>
                                    <li><code>&lbrace;&lbrace;student.dob&rbrace;&rbrace;</code></li>
                                    <li><code>&lbrace;&lbrace;student.aadhar_number&rbrace;&rbrace;</code></li>
                                    <li><code>&lbrace;&lbrace;student.address_line_1&rbrace;&rbrace;</code></li>
                                    <li><code>&lbrace;&lbrace;student.city&rbrace;&rbrace;</code></li>
                                </ul>
                                <strong>Conditional Photo Logic:</strong>
                                <pre class="bg-light p-2 border rounded border-dark border-opacity-25 small">
&lbrace;&lbrace;#if student.photo_url&rbrace;&rbrace;
  &lt;img src="&lbrace;&lbrace;student.photo_url&rbrace;&rbrace;" /&gt;
&lbrace;&lbrace;else&rbrace;&rbrace;
  &lt;span&gt;No Photo&lt;/span&gt;
&lbrace;&lbrace;/if&rbrace;&rbrace;</pre>
                            </div>
                        </div>
                    </div>

                    <!-- Application Variables -->
                    <div class="accordion-item">
                        <h2 class="accordion-header" id="headingApp">
                            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseApp" aria-expanded="false" aria-controls="collapseApp">
                                <strong>2. Application Form Data (application.*)</strong>
                            </button>
                        </h2>
                        <div id="collapseApp" class="accordion-collapse collapse" aria-labelledby="headingApp" data-bs-parent="#helpAccordion">
                            <div class="accordion-body">
                                <p class="small text-muted">Standard application status and the dynamic data submitted during the admission form step.</p>
                                <ul>
                                    <li><code>&lbrace;&lbrace;application.id&rbrace;&rbrace;</code> - System Application ID</li>
                                    <li><code>&lbrace;&lbrace;application.form_type&rbrace;&rbrace;</code> - e.g., ACPC, MQ/NRI</li>
                                    <li><code>&lbrace;&lbrace;application.academic_year&rbrace;&rbrace;</code> - e.g., 2025-2026</li>
                                </ul>
                                <strong>Dynamic Admission Form Fields (application.form_data.*):</strong>
                                <p class="small">Data entered by the student into the specific form type (defined in Form Builder) using the exact field 'Key'.</p>
                                <ul>
                                    <li><code>&lbrace;&lbrace;application.form_data.acpc_number&rbrace;&rbrace;</code></li>
                                    <li><code>&lbrace;&lbrace;application.form_data.entrance_exam_number&rbrace;&rbrace;</code></li>
                                    <li><code>&lbrace;&lbrace;application.form_data.school_name&rbrace;&rbrace;</code></li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <!-- Institution Variables -->
                    <div class="accordion-item">
                        <h2 class="accordion-header" id="headingInst">
                            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseInst" aria-expanded="false" aria-controls="collapseInst">
                                <strong>3. College & Course (college.* / course.*)</strong>
                            </button>
                        </h2>
                        <div id="collapseInst" class="accordion-collapse collapse" aria-labelledby="headingInst" data-bs-parent="#helpAccordion">
                            <div class="accordion-body">
                                <ul>
                                    <li><code>&lbrace;&lbrace;course.name&rbrace;&rbrace;</code> - e.g., Master of Computer Application</li>
                                    <li><code>&lbrace;&lbrace;course.code&rbrace;&rbrace;</code></li>
                                    <li><code>&lbrace;&lbrace;college.name&rbrace;&rbrace;</code></li>
                                    <li><code>&lbrace;&lbrace;college.logo_url&rbrace;&rbrace;</code></li>
                                    <li><code>&lbrace;&lbrace;college.university_name&rbrace;&rbrace;</code></li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <!-- Marks Variables -->
                    <div class="accordion-item">
                        <h2 class="accordion-header" id="headingMarks">
                            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseMarks" aria-expanded="false" aria-controls="collapseMarks">
                                <strong>4. Academic Marks (marks.* / entrance_marks.*)</strong>
                            </button>
                        </h2>
                        <div id="collapseMarks" class="accordion-collapse collapse" aria-labelledby="headingMarks" data-bs-parent="#helpAccordion">
                            <div class="accordion-body">
                                <p class="small text-muted">Board Exam marks are aggregated under the <code>marks</code> object by the lowercase subject name. Entrance marks (usually stored in form_data) are mapped to <code>entrance_marks</code>.</p>
                                
                                <strong>Board Subjects (e.g., math, physics, english, total):</strong>
                                <ul>
                                    <li><code>&lbrace;&lbrace;marks.math.theory_obtained&rbrace;&rbrace;</code></li>
                                    <li><code>&lbrace;&lbrace;marks.math.theory_max&rbrace;&rbrace;</code></li>
                                    <li><code>&lbrace;&lbrace;marks.math.practical_obtained&rbrace;&rbrace;</code></li>
                                    <li><code>&lbrace;&lbrace;marks.math.practical_max&rbrace;&rbrace;</code></li>
                                    <li><code>&lbrace;&lbrace;marks.math.obtained&rbrace;&rbrace;</code> (Total combined)</li>
                                </ul>

                                <strong>Entrance Exams (e.g., GUJCET subjects):</strong>
                                <ul>
                                    <li><code>&lbrace;&lbrace;entrance_marks.physics.obtained&rbrace;&rbrace;</code></li>
                                    <li><code>&lbrace;&lbrace;entrance_marks.total.obtained&rbrace;&rbrace;</code></li>
                                </ul>
                            </div>
                        </div>
                    </div>

                </div>

            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" on:click={closeModal}>Close Guide</button>
            </div>
        </div>
    </div>
</div>
{/if}
