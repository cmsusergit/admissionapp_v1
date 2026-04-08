<script lang="ts">
    import type { PageData } from './$types';
    import { downloadReceiptPDF, generateReceiptPDF } from '$lib/utils/pdfGenerator';

    export let data: PageData;
    const { payment, university, college } = data;
    const app = payment.applications;
    const student = app?.student_user;
    const profile = student?.student_profiles;
    const course = app?.courses;
    const branch = app?.branches;
    
    const admissionNo = Array.isArray(app?.account_admissions) 
        ? app?.account_admissions[0]?.admission_number 
        : app?.account_admissions?.admission_number;

    let feeBreakdown = payment.fee_components_breakdown; 
    
    const paymentModes = payment.payment_breakdown || [];

    let totalStructureFee = 0;
    if (feeBreakdown && Array.isArray(feeBreakdown)) {
        totalStructureFee = feeBreakdown.reduce((sum: number, section: any) => {
            return sum + (section.items?.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0) || 0);
        }, 0);
    }
    
    const amountPaid = Number(payment.amount) || 0;
    const balanceDue = Math.max(0, totalStructureFee - amountPaid);
    const isPartial = balanceDue > 0 && amountPaid < totalStructureFee;

    function triggerPrint() {
        const receiptData = {
            receiptNumber: payment.receipt_number || payment.transaction_id || 'PENDING',
            date: payment.payment_date,
            studentName: student?.full_name || 'N/A',
            email: student?.email || 'N/A',
            enrollmentNumber: profile?.enrollment_number,
            admissionNumber: admissionNo,
            courseName: course?.name || 'N/A',
            branchName: branch?.name,
            paymentType: payment.payment_type || 'fee',
            transactionId: payment.transaction_id,
            amount: amountPaid,
            totalStructureFee,
            feeBreakdown,
            paymentModes: paymentModes.map((m: any) => ({ mode: m.mode || m.type, amount: Number(m.amount), ref: m.ref })),
            university: {
                name: college?.name || university?.name || 'College Name',
                logoUrl: college?.logo_url || university?.logo_url,
                address: college?.address || university?.address,
                contactEmail: university?.contact_email
            }
        };
        generateReceiptPDF(receiptData);
    }

    function triggerDownload() {
        const receiptData = {
            receiptNumber: payment.receipt_number || payment.transaction_id || 'PENDING',
            date: payment.payment_date,
            studentName: student?.full_name || 'N/A',
            email: student?.email || 'N/A',
            enrollmentNumber: profile?.enrollment_number,
            admissionNumber: admissionNo,
            courseName: course?.name || 'N/A',
            branchName: branch?.name,
            paymentType: payment.payment_type || 'fee',
            transactionId: payment.transaction_id,
            amount: amountPaid,
            totalStructureFee,
            feeBreakdown,
            paymentModes: paymentModes.map((m: any) => ({ mode: m.mode || m.type, amount: Number(m.amount), ref: m.ref })),
            university: {
                name: college?.name || university?.name || 'College Name',
                logoUrl: college?.logo_url || university?.logo_url,
                address: college?.address || university?.address,
                contactEmail: university?.contact_email
            }
        };
        downloadReceiptPDF(receiptData);
    }
</script>

<svelte:head>
    <title>Fee Receipt - {payment.receipt_number || 'Draft'}</title>
</svelte:head>

<div class="actions-bar text-end p-3 d-print-none">
    <button class="btn btn-secondary me-2" on:click={triggerPrint}>
        <i class="bi bi-printer me-2"></i> Print Receipt (PDF)
    </button>
    <button class="btn btn-primary" on:click={triggerDownload}>
        <i class="bi bi-download me-2"></i> Download PDF
    </button>
</div>

<div class="receipt-container" id="receipt-element">
    <!-- Receipt Copy Template -->
    {#snippet receiptCopy(copyLabel?: string)}
        <div class="receipt-copy">
            {#if copyLabel}
                <div class="copy-label">{copyLabel}</div>
            {/if}
            <header class="mb-4 border-bottom pb-3">
                <div class="d-flex align-items-center mb-3">
                    {#if college?.logo_url || university?.logo_url}
                        <img src={college?.logo_url || university?.logo_url} alt="Logo" class="me-3" style="height: 65px;">
                    {/if}
                    <div class="flex-grow-1 text-start">
                        <h2 class="m-0 fw-bold">{college?.name || university?.name || 'College Name'}</h2>
                        <p class="mb-0 small text-muted">
                            {college?.address || university?.address || 'College Address'} | 
                            {university?.contact_email || 'email@example.com'}
                        </p>
                    </div>
                </div>
                <div class="text-center py-2">
                    <h3 class="text-uppercase fw-bold m-0" style="letter-spacing: 2px; border-top: 1px solid #eee; border-bottom: 1px solid #eee; display: inline-block; padding: 5px 20px;">Fee Receipt</h3>
                </div>
            </header>

            <div class="row mb-4 info-grid">
                <div class="col-6">
                    <p><strong>Receipt No:</strong> {payment.receipt_number || payment.transaction_id || 'PENDING'}</p>
                    <p><strong>Date:</strong> {new Date(payment.payment_date).toLocaleDateString()}</p>
                    <p><strong>Student Name:</strong> {student?.full_name}</p>
                    <p><strong>Email:</strong> {student?.email}</p>
                </div>
                <div class="col-6 text-end">
                    {#if profile?.enrollment_number}
                        <p><strong>College ID:</strong> {profile.enrollment_number}</p>
                        <p><strong>Admission No:</strong> {admissionNo || 'N/A'}</p>
                    {:else}
                        <p><strong>Prov Admission ID:</strong> {admissionNo || 'N/A'}</p>
                    {/if}
                    <p><strong>Course:</strong> {course?.name}</p>
                    {#if branch?.name}
                        <p><strong>Branch:</strong> {branch.name}</p>
                    {/if}
                </div>
            </div>

            <table class="table table-bordered mb-4">
                <thead class="table-light">
                    <tr>
                        <th>Description</th>
                        <th class="text-end" style="width: 180px;">Applicable Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <span class="fw-bold text-uppercase">{payment.payment_type?.replace('_', ' ')}</span>
                            {#if payment.transaction_id}
                                <br><small class="text-muted">Ref: {payment.transaction_id}</small>
                            {/if}
                        </td>
                        <td class="text-end fw-bold">{Number(payment.amount).toFixed(2)}</td>
                    </tr>

                    {#if feeBreakdown && Array.isArray(feeBreakdown) && payment.payment_type === 'tuition_fee'}
                        <tr class="table-secondary"><td colspan="2" class="py-1"><small class="fw-bold">FEE STRUCTURE BREAKDOWN</small></td></tr>
                        {#each feeBreakdown as section}
                            {#if section.name}
                                <tr><td colspan="2" class="fst-italic text-muted ps-3 bg-light"><small>{section.name}</small></td></tr>
                            {/if}
                            {#if section.items}
                                {#each section.items as item}
                                    <tr>
                                        <td class="ps-4">{item.name}</td>
                                        <td class="text-end">{Number(item.amount).toFixed(2)}</td>
                                    </tr>
                                {/each}
                            {/if}
                        {/each}
                    {/if}
                </tbody>
                <tfoot class="table-light border-top border-dark">
                    <tr>
                        <td class="text-end">Total Applicable Fee</td>
                        <td class="text-end">₹ {totalStructureFee.toFixed(2)}</td>
                    </tr>
                    <tr>
                        <td class="fw-bold text-end fs-5">AMOUNT PAID</td>
                        <td class="fw-bold text-end fs-5">₹ {amountPaid.toFixed(2)}</td>
                    </tr>
                    {#if isPartial}
                        <tr class="text-danger">
                            <td class="text-end fw-bold">Balance Due</td>
                            <td class="text-end fw-bold">₹ {balanceDue.toFixed(2)}</td>
                        </tr>
                    {/if}
                </tfoot>
            </table>

            {#if paymentModes.length > 0}
                <div class="mb-4 border p-3 bg-light rounded">
                    <h6 class="text-uppercase fw-bold border-bottom pb-2 mb-2">Transaction Details</h6>
                    <div class="row">
                        {#each paymentModes as mode}
                            <div class="col-6 mb-1">
                                <strong>Mode:</strong> <span class="text-capitalize">{mode.mode}</span>
                            </div>
                            <div class="col-6 mb-1 text-end">
                                <strong>Amount:</strong> ₹{mode.amount}
                            </div>
                            {#if mode.ref}
                                <div class="col-12 text-muted small">
                                    Reference/Cheque No: {mode.ref}
                                </div>
                            {/if}
                        {/each}
                    </div>
                </div>
            {/if}

            <footer class="text-center text-muted small">
                <p>This is a computer-generated receipt and does not require a signature.</p>
            </footer>
        </div>
    {/snippet}

    <!-- Two Copies -->
    {@render receiptCopy("Office Copy")}
    <div class="cut-line"></div>
    {@render receiptCopy("Student Copy")}
</div>

<style>
    .receipt-container {
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        background: white;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 12px;
    }
    .receipt-copy {
        padding: 10px 0;
    }
    .copy-label {
        text-align: center;
        font-weight: bold;
        color: #666;
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin-bottom: 5px;
    }
    .cut-line {
        border-top: 2px dashed #ccc;
        margin: 10px 0 20px 0;
        position: relative;
    }
    .cut-line::before {
        content: "✂ CUT HERE";
        position: absolute;
        left: 50%;
        top: -8px;
        transform: translateX(-50%);
        background: white;
        padding: 0 10px;
        font-size: 10px;
        color: #999;
    }
    h2 { font-size: 1.5rem; }
    h3 { font-size: 1.2rem; }
    p { margin-bottom: 0.25rem; }
    .table td, .table th {
        padding: 0.25rem 0.5rem;
        font-size: 12px;
    }
    .info-grid p { font-size: 13px; }
    
    @media print {
        body * {
            visibility: hidden;
        }
        .receipt-container, .receipt-container * {
            visibility: visible;
        }
        .receipt-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: 297mm; /* Full A4 height */
            margin: 0;
            padding: 10mm;
            border: none;
            box-shadow: none;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
        }
        .actions-bar {
            display: none !important;
        }
        .receipt-copy {
            height: 48%; /* Each copy takes ~half the page */
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
        }
        .cut-line {
            margin: 0;
            width: 100%;
        }
    }
</style>
