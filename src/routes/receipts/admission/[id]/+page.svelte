<script lang="ts">
    import type { PageData } from './$types';
    import { onMount } from 'svelte';
    import { page } from '$app/stores';
    import { generateAdmissionSlipPDF, downloadAdmissionSlipPDF } from '$lib/utils/pdfGenerator';

    export let data: PageData;
    const { application, university, college } = data;
    
    const student = application.student_user;
    const course = application.courses;
    const branch = application.branches;
    const admissionCycle = application.admission_cycles;
    
    const admissionNo = Array.isArray(application.account_admissions) 
        ? application.account_admissions[0]?.admission_number 
        : application.account_admissions?.admission_number;

    const receiptData = {
        receiptNumber: '', // Not used for admission slip
        date: new Date().toISOString(),
        studentName: student?.full_name || 'N/A',
        email: student?.email || 'N/A',
        admissionNumber: admissionNo,
        courseName: course?.name || 'N/A',
        branchName: branch?.name,
        academicYear: admissionCycle?.academic_years?.name || '-',
        paymentType: application.form_type || 'Admission',
        admissionType: application.form_type,
        amount: 0,
        totalStructureFee: 0,
        university: {
            name: college?.name || university?.name || 'College Name',
            logoUrl: college?.logo_url || university?.logo_url,
            address: college?.address || university?.address || 'Vasad',
            contactEmail: university?.contact_email || 'admission@svitvasad.ac.in'
        },
        collegeAlias: college?.code || 'SVIT'
    };

    onMount(() => {
        if ($page.url.searchParams.has('print')) {
            setTimeout(() => {
                generateAdmissionSlipPDF(receiptData);
            }, 500);
        }
    });

    function handlePrint() {
        generateAdmissionSlipPDF(receiptData);
    }

    function handleDownload() {
        downloadAdmissionSlipPDF(receiptData);
    }
</script>

<svelte:head>
    <title>Admission Slip - {student?.full_name || 'Student'}</title>
</svelte:head>

<div class="actions-bar d-print-none text-end p-3 bg-light border-bottom">
    <button class="btn btn-secondary shadow-sm me-2" on:click={handleDownload}>
        <i class="bi bi-download me-2"></i> Download PDF
    </button>
    <button class="btn btn-primary shadow-sm" on:click={handlePrint}>
        <i class="bi bi-printer me-2"></i> Print Admission Slip
    </button>
</div>

<div class="receipt-outer-container">
    <div class="receipt-page">
        <div class="receipt-header text-center mb-4">
            <div class="d-flex align-items-center justify-content-center mb-3">
                {#if college?.logo_url || university?.logo_url}
                    <img src={college?.logo_url || university?.logo_url} alt="Logo" class="me-3" style="height: 60px;">
                {/if}
                <div>
                    <h2 class="m-0 fw-bold">{college?.name || university?.name || 'College Name'}</h2>
                    <p class="small text-muted m-0">{college?.address || university?.address || ''}</p>
                </div>
            </div>
            <div class="badge bg-dark px-4 py-2 text-uppercase" style="font-size: 1rem; letter-spacing: 1px;">
                Provisional Admission Slip
            </div>
        </div>

        <div class="receipt-body">
            <div class="row mb-4 border-bottom pb-3">
                <div class="col-7">
                    <p class="mb-1 text-muted small">Student Full Name</p>
                    <h5 class="fw-bold text-uppercase">{student?.full_name || 'N/A'}</h5>
                </div>
                <div class="col-5 text-end">
                    <p class="mb-1 text-muted small">Admission Number</p>
                    <h5 class="fw-bold text-primary">{admissionNo || 'PENDING'}</h5>
                </div>
            </div>

            <div class="info-grid">
                <div class="info-item">
                    <span class="label">Course</span>
                    <span class="value">{course?.name || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="label">Branch</span>
                    <span class="value">{branch?.name || 'General / Not Applicable'}</span>
                </div>
                <div class="info-item">
                    <span class="label">Academic Year</span>
                    <span class="value">{admissionCycle?.academic_years?.name || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="label">Application Type</span>
                    <span class="value badge bg-secondary">{application.form_type}</span>
                </div>
                <div class="info-item">
                    <span class="label">Admission Mode</span>
                    <span class="value">{application.admission_type || 'Regular'}</span>
                </div>
                <div class="info-item">
                    <span class="label">Date of Issue</span>
                    <span class="value">{new Date().toLocaleDateString('en-IN')}</span>
                </div>
            </div>

            <div class="status-box mt-4 p-3 bg-light border rounded text-center">
                <p class="m-0 fw-bold text-success">
                    <i class="bi bi-patch-check-fill me-2"></i>
                    Status: {application.status.toUpperCase()}
                </p>
            </div>
        </div>

        <div class="receipt-footer mt-auto pt-5">
            <div class="d-flex justify-content-between align-items-end">                
                <div class="signature-box text-center">
                    <div class="sig-line"></div>
                    <p class="small m-0">Authorized Signature</p>
                    <p class="x-small text-muted">{college?.code || 'SVIT'}, Vasad</p>
                </div>
            </div>
            
            <div class="footer-note mt-4 border-top pt-2">
                <p class="x-small text-muted italic m-0">
                    * This is a computer-generated admission slip. Please present this slip for fee payment and enrollment processes.
                </p>
            </div>
        </div>
    </div>
</div>

<style>
    :global(body) {
        background-color: #f8f9fa;
    }

    .receipt-outer-container {
        padding: 20px;
        display: flex;
        justify-content: center;
    }

    .receipt-page {
        width: 148mm;
        height: 210mm;
        background: white;
        padding: 20mm;
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
        display: flex;
        flex-direction: column;
        color: #333;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }

    h2 { font-size: 1.4rem; color: #1a1a1a; }
    
    .info-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-top: 10px;
    }

    .info-item {
        display: flex;
        flex-direction: column;
    }

    .label {
        font-size: 0.75rem;
        color: #666;
        text-transform: uppercase;
        margin-bottom: 2px;
    }

    .value {
        font-size: 0.95rem;
        font-weight: 600;
        color: #222;
    }

    .signature-box {
        width: 150px;
    }

    .sig-line {
        border-top: 1px solid #333;
        margin-bottom: 5px;
        height: 40px;
    }

    .x-small { font-size: 0.65rem; }
    .italic { font-style: italic; }

    @page {
        size: A5;
        margin: 0;
    }

    @media print {
        .actions-bar { display: none !important; }
        .receipt-outer-container { padding: 0; background: transparent; }
        .receipt-page { 
            box-shadow: none; 
            margin: 0; 
            width: 148mm;
            height: 210mm;
            padding: 15mm;
        }
    }
</style>
