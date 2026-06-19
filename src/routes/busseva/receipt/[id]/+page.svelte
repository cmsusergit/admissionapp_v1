<script lang="ts">
    import { onMount } from 'svelte';
    import type { PageData } from './$types';

    let { data } = $props<{ data: PageData }>();
    const record = data.record;

    async function printReceipt() {
        try {
            // Dynamic client-side imports to avoid Svelte SSR window exceptions
            const pdfMakeModule = await import('pdfmake/build/pdfmake.js');
            const pdfFontsModule = await import('pdfmake/build/vfs_fonts.js');
            const pdfMake: any = pdfMakeModule.default || pdfMakeModule;
            const pdfFonts: any = pdfFontsModule.default || pdfFontsModule;
            pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

            const studentName = record.student?.full_name || 'N/A';
            const enrollmentNo = record.student?.student_profiles?.enrollment_number || record.enrollment_number || 'N/A';
            const activeApp = record.student?.student_profiles?.active_app;
            const collegeName = activeApp?.courses?.colleges?.name || 'Sardar Vallabhbhai Patel Institute of Technology';
            const branchName = activeApp?.branches?.name || 'N/A';
            const collectorName = record.collector?.full_name || 'N/A';

            const createReceiptLayout = (title: string) => [
                { text: collegeName.toUpperCase(), style: 'collegeName', alignment: 'center' },
                { text: 'BUS SEVA FEE RECEIPT', style: 'receiptTitle', alignment: 'center' },
                { text: `(${title})`, style: 'receiptSubtitle', alignment: 'center' },
                { margin: [0, 10, 0, 10], table: {
                    widths: ['*', '*'],
                    body: [
                        [
                            { text: `Receipt No: ${record.receipt_number}`, bold: true },
                            { text: `Date: ${new Date(record.payment_date).toLocaleDateString('en-GB')}`, alignment: 'right' }
                        ],
                        [
                            { text: `Enrollment No: ${enrollmentNo}` },
                            { text: `Student Name: ${studentName}`, alignment: 'right' }
                        ],
                        [
                            { text: `Branch: ${branchName}` },
                            { text: `Transaction Reference No: ${record.transaction_number}`, bold: true, alignment: 'right' }
                        ],
                        [
                            { text: 'Particulars: Bus Seva Fee Collection' },
                            { text: `TOTAL AMOUNT: INR ${record.total_amount.toLocaleString('en-IN')}`, bold: true, alignment: 'right' }
                        ]
                    ]
                }, layout: 'noBorders' },
                { margin: [0, 15, 0, 0], columns: [
                    { text: `Collected By: ${collectorName}`, style: 'signaturePart' },
                    { text: 'Authorized Signature: _________________', style: 'signaturePart', alignment: 'right' }
                ] }
            ];

            const docDefinition = {
                pageSize: 'A4',
                pageMargins: [35, 35, 35, 35],
                content: [
                    ...createReceiptLayout('STUDENT COPY'),
                    {
                        margin: [0, 35, 0, 35],
                        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 525, y2: 0, lineWidth: 1, dash: { length: 5, space: 3 } }]
                    },
                    ...createReceiptLayout('OFFICE COPY')
                ],
                styles: {
                    collegeName: { fontSize: 12, bold: true },
                    receiptTitle: { fontSize: 10, bold: true, margin: [0, 2, 0, 0] },
                    receiptSubtitle: { fontSize: 8, italic: true },
                    signaturePart: { fontSize: 8, margin: [0, 5, 0, 0] }
                },
                defaultStyle: {
                    fontSize: 9
                }
            };

            pdfMake.createPdf(docDefinition).print();
        } catch (error) {
            console.error('Failed to generate receipt PDF:', error);
        }
    }

    onMount(() => {
        printReceipt();
    });
</script>

<div class="container text-center mt-5">
    <div class="card p-5 shadow-sm mx-auto" style="max-width: 500px;">
        <i class="bi bi-file-earmark-pdf-fill text-danger display-1 mb-3"></i>
        <h3>Generating Printable Receipt</h3>
        <p class="text-muted">A print window should open automatically.</p>
        <button class="btn btn-primary btn-lg mt-3" onclick={printReceipt}>Print Receipt</button>
        <a href="/busseva" class="btn btn-outline-secondary btn-lg mt-2">Back to Search</a>
    </div>
</div>
