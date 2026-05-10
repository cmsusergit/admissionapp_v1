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

    const academicYear = app?.admission_cycles?.academic_years?.name || '-';
    
    let feeBreakdown = payment.fee_components_breakdown; 
    const paymentModes = payment.payment_breakdown || [];

    // Robust amount parsing
    function parseAmount(val: any): number {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        const clean = String(val).replace(/[^0-9.-]+/g, '');
        const parsed = parseFloat(clean);
        return isNaN(parsed) ? 0 : parsed;
    }

    let grandTotal = parseAmount(payment.amount);

    function numberToWords(num: number): string {
        const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
        const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        let numStr = num.toString();
        if (numStr.length > 9) return 'overflow';
        const n: any = ('000000000' + numStr).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return ''; 
        let str = '';
        str += (Number(n[1]) != 0) ? (a[Number(n[1])] || b[Number(n[1][0])] + ' ' + a[Number(n[1][1])]) + 'Crore ' : '';
        str += (Number(n[2]) != 0) ? (a[Number(n[2])] || b[Number(n[2][0])] + ' ' + a[Number(n[2][1])]) + 'Lakh ' : '';
        str += (Number(n[3]) != 0) ? (a[Number(n[3])] || b[Number(n[3][0])] + ' ' + a[Number(n[3][1])]) + 'Thousand ' : '';
        str += (Number(n[4]) != 0) ? (a[Number(n[4])] || b[Number(n[4][0])] + ' ' + a[Number(n[4][1])]) + 'Hundred ' : '';
        str += (Number(n[5]) != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[Number(n[5][0])] + ' ' + a[Number(n[5][1])]) + 'Only' : 'Only';
        return str.trim();
    }

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
            academicYear: academicYear,
            semester: 'FIRST SEMESTER',
            paymentType: payment.payment_type || 'fee',
            transactionId: payment.transaction_id,
            amount: grandTotal,
            totalStructureFee: grandTotal, 
            feeBreakdown: (feeBreakdown || []).map((s: any) => ({
                name: s.name,
                items: (s.items || []).map((i: any) => ({ name: i.name, amount: parseAmount(i.amount) }))
            })),
            paymentModes: paymentModes.map((m: any) => ({ 
                mode: m.mode || m.type, 
                amount: parseAmount(m.amount), 
                ref: m.ref || m.reference,
                date: m.date || payment.payment_date,
                bankName: m.bankName
            })),
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
            academicYear: academicYear,
            semester: 'FIRST SEMESTER',
            paymentType: payment.payment_type || 'fee',
            transactionId: payment.transaction_id,
            amount: grandTotal,
            totalStructureFee: grandTotal,
            feeBreakdown: (feeBreakdown || []).map((s: any) => ({
                name: s.name,
                items: (s.items || []).map((i: any) => ({ name: i.name, amount: parseAmount(i.amount) }))
            })),
            paymentModes: paymentModes.map((m: any) => ({ 
                mode: m.mode || m.type, 
                amount: parseAmount(m.amount), 
                ref: m.ref || m.reference,
                date: m.date || payment.payment_date,
                bankName: m.bankName
            })),
            university: {
                name: college?.name || university?.name || 'College Name',
                logoUrl: college?.logo_url || university?.logo_url,
                address: college?.address || university?.address,
                contactEmail: university?.contact_email
            }
        };
        downloadReceiptPDF(receiptData);
    }

    // Helper for finding payment modes for grid
    const getMode = (type: string) => paymentModes.find((m: any) => (m.mode || m.type).toLowerCase() === type.toLowerCase());

</script>

<svelte:head>
    <title>Fee Receipt - {payment.receipt_number || 'Draft'}</title>
</svelte:head>

<div class="actions-bar text-end p-3 d-print-none bg-light border-bottom">
    <button class="btn btn-secondary me-2 shadow-sm" on:click={triggerPrint}>
        <i class="bi bi-printer me-2"></i> Print Receipt (PDF)
    </button>
    <button class="btn btn-primary shadow-sm" on:click={triggerDownload}>
        <i class="bi bi-download me-2"></i> Download PDF
    </button>
</div>

<div class="receipt-outer-container">
    <div class="receipt-page" id="receipt-element">
        
        <!-- Header -->
        <div class="receipt-header text-center mb-4">
            <div class="d-flex align-items-center justify-content-center mb-2">
                {#if college?.logo_url || university?.logo_url}
                    <img src={college?.logo_url || university?.logo_url} alt="Logo" class="me-3" style="height: 60px;">
                {/if}
                <h2 class="m-0 fw-bold">{college?.name || university?.name || 'College Name'}</h2>
            </div>
            <h5 class="fw-bold">Academic Year: {academicYear}</h5>
        </div>

        <!-- Student Metadata -->
        <div class="row mb-2">
            <div class="col-7">
                <p><strong>Student ID:</strong> {profile?.enrollment_number || admissionNo || '-'}</p>
                <p><strong>Branch Name:</strong> {branch?.name || course?.name || '-'}</p>
            </div>
            <div class="col-5 text-end">
                <p><strong>Receipt Number:</strong> {payment.receipt_number || 'PENDING'}</p>
                <p><strong>Date:</strong> {new Date(payment.payment_date).toLocaleDateString('en-IN')}</p>
            </div>
        </div>

        <div class="received-section mb-3">
            <p class="mb-1">Recieved From,</p>
            <h5 class="fw-bold mb-2 text-uppercase">{student?.full_name}</h5>
            <p>The Following amount as Fees for the <strong>{course?.name}</strong> for a <strong>FIRST SEMESTER {academicYear}</strong></p>
        </div>

        <!-- Fee Table -->
        <table class="table table-bordered border-dark fee-table mb-2">
            <thead>
                <tr class="bg-light">
                    <th style="width: 50px;" class="text-center">Sr.</th>
                    <th>Particulars</th>
                    <th style="width: 150px;" class="text-end">Fees in Rs.</th>
                </tr>
            </thead>
            <tbody>
                {#if feeBreakdown && Array.isArray(feeBreakdown)}
                    {#each feeBreakdown as section}
                        {#if section.name}
                            <tr class="section-header">
                                <td></td>
                                <td class="fw-bold">{section.name}</td>
                                <td></td>
                            </tr>
                        {/if}
                        
                        {#each section.items || [] as item, i}
                            <tr>
                                <td class="text-center">{i + 1}</td>
                                <td>{item.name}</td>
                                <td class="text-end">{parseAmount(item.amount).toLocaleString('en-IN')}</td>
                            </tr>
                        {/each}

                        <tr class="subtotal-row">
                            <td></td>
                            <td class="text-end fw-bold">SubTotal</td>
                            <td class="text-end fw-bold">
                                {#if section.items}
                                    {section.items.reduce((s: number, it: any) => s + parseAmount(it.amount), 0).toLocaleString('en-IN')}
                                {:else}
                                    0
                                {/if}
                            </td>
                        </tr>
                    {/each}
                {:else}
                    <tr>
                        <td class="text-center">1</td>
                        <td>{payment.payment_type?.replace('_', ' ').toUpperCase()}</td>
                        <td class="text-end">{grandTotal.toLocaleString('en-IN')}</td>
                    </tr>
                {/if}
            </tbody>
            <tfoot>
                <tr class="grand-total-row">
                    <td></td>
                    <td class="text-end fw-bold">Grand Total in Rs.</td>
                    <td class="text-end fw-bold">{grandTotal.toLocaleString('en-IN')}</td>
                </tr>
            </tfoot>
        </table>

        <div class="words-section mb-4">
            <p><strong>In Words:</strong> {numberToWords(grandTotal)}</p>
        </div>

        <!-- Payment Mode Grid -->
        <div class="payment-grid mb-4">
            <table class="table table-bordered border-dark mb-0">
                <tbody>
                    <tr>
                        <td class="fw-bold bg-light" style="width: 120px;">CASH</td>
                        <td>Amount: {getMode('cash') ? Number(getMode('cash').amount).toLocaleString('en-IN') : '0'}</td>
                        <td>ADVANCE Amount: 0</td>
                        <td>Freeship Amount: 0</td>
                    </tr>
                    
                    <tr>
                        <td class="fw-bold bg-light">DD/Cheque</td>
                        <td>Amount: {(getMode('cheque') || getMode('dd')) ? Number((getMode('cheque') || getMode('dd')).amount).toLocaleString('en-IN') : '0'}</td>
                        <td>Bank Name: {(getMode('cheque') || getMode('dd'))?.bankName || '-'}</td>
                        <td>Ref.: {(getMode('cheque') || getMode('dd'))?.ref || '-'} Date: {(getMode('cheque') || getMode('dd'))?.date ? new Date((getMode('cheque') || getMode('dd')).date).toLocaleDateString() : '-'}</td>
                    </tr>

                    <tr>
                        <td class="fw-bold bg-light">Online</td>
                        <td>Amount: {getMode('online') ? Number(getMode('online').amount).toLocaleString('en-IN') : '0'}</td>
                        <td colspan="2">Reference Number: {getMode('online')?.ref || '-'}</td>
                    </tr>

                    <tr>
                        <td class="fw-bold bg-light">ACPC</td>
                        <td>Amount: {getMode('acpc') ? Number(getMode('acpc').amount).toLocaleString('en-IN') : '0'}</td>
                        <td>Rec.Number: {getMode('acpc')?.ref || '-'}</td>
                        <td>Payment Date: {getMode('acpc')?.date ? new Date(getMode('acpc').date).toLocaleDateString() : '-'}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- Footer -->
        <div class="d-flex justify-content-end mb-5">
            <div class="text-center" style="width: 200px;">
                <div style="height: 60px;"></div>
                <p class="mb-0 fw-bold">Authorized Signature</p>
                <p class="small">SVIT, Vasad</p>
            </div>
        </div>

        <div class="footer-notes border-top pt-3 mt-auto">
            <p class="small mb-1 italic"><strong>Note::</strong> In addition to above tuition fees, candidate shall have to pay the fees of course/institute fixed by the Fees Regulatory Committee as and when declared from the academic year 2025-26</p>
            <p class="small italic"><strong>Note::</strong> Rs.5,000/- refundable deposit after Final Semester clear and verification of original Marksheet</p>
        </div>

    </div>
</div>

<style>
    .receipt-outer-container {
        background-color: #f0f2f5;
        padding: 40px 0;
        min-height: 100vh;
    }

    .receipt-page {
        max-width: 850px;
        margin: 0 auto;
        background: white;
        padding: 40px;
        box-shadow: 0 0 20px rgba(0,0,0,0.1);
        min-height: 297mm; /* A4 Height approx */
        display: flex;
        flex-direction: column;
        color: black;
        font-family: Arial, sans-serif;
    }

    h2 { font-size: 1.5rem; letter-spacing: 0.5px; }
    p { margin-bottom: 0.4rem; font-size: 14px; }

    .fee-table th, .fee-table td {
        padding: 6px 12px;
        font-size: 13px;
        vertical-align: middle;
    }

    .section-header td {
        background-color: #f8f9fa;
        font-size: 13px;
    }

    .subtotal-row td {
        border-top: 1px solid #dee2e6;
        font-size: 13px;
    }

    .grand-total-row td {
        border-top: 2px solid black;
        font-size: 15px;
    }

    .payment-grid td {
        padding: 6px 10px;
        font-size: 12px;
        border-color: black !important;
    }

    .footer-notes p {
        font-size: 11px;
        line-height: 1.4;
    }

    .italic { font-style: italic; }

    @media print {
        .actions-bar { display: none !important; }
        .receipt-outer-container { padding: 0; background: white; }
        .receipt-page { 
            box-shadow: none; 
            padding: 15mm;
            width: 100%;
            height: 100%;
        }
    }
</style>
