<script lang="ts">
    import { onMount } from 'svelte';
    import type { PageData } from './$types';

    let { data } = $props<{ data: PageData }>();
    const record = data.record;
    let photoBase64: string | null = null;
    let logoBase64: string | null = null;

    async function getBase64ImageFromUrl(imageUrl: string): Promise<string | null> {
        try {
            const res = await fetch(imageUrl);
            const blob = await res.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.addEventListener('load', () => resolve(reader.result as string));
                reader.addEventListener('error', () => reject(null));
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('Failed to convert image to base64:', error);
            return null;
        }
    }

    async function loadAssets() {
        if (data.photoUrl) {
            photoBase64 = await getBase64ImageFromUrl(data.photoUrl);
        }
        if (data.logoUrl) {
            if (data.logoUrl.startsWith('data:')) {
                logoBase64 = data.logoUrl;
            } else {
                logoBase64 = await getBase64ImageFromUrl(data.logoUrl);
            }
        }
    }

    async function printReceipt() {
        try {
            // Dynamic client-side imports to avoid Svelte SSR window exceptions
            const pdfMakeModule = await import('pdfmake/build/pdfmake.js');
            const pdfFontsModule = await import('pdfmake/build/vfs_fonts.js');
            const pdfMake: any = pdfMakeModule.default || pdfMakeModule;
            const pdfFonts: any = pdfFontsModule.default || pdfFontsModule;
            pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts.vfs;

            const studentName = record.student?.full_name || 'N/A';
            const profileRaw = record.student?.student_profiles;
            const profile = Array.isArray(profileRaw) ? profileRaw[0] : profileRaw;
            const enrollmentNo = profile?.enrollment_number || record.enrollment_number || 'N/A';
            const activeAppRaw = profile?.active_app;
            const activeApp = Array.isArray(activeAppRaw) ? activeAppRaw[0] : activeAppRaw;

            const collegeName = data.collegeName || activeApp?.courses?.colleges?.name || 'Sardar Vallabhbhai Patel Institute of Technology';
            const branchName = activeApp?.branches?.name || 'N/A';
            const collectorName = record.collector?.full_name || 'N/A';
            const routeName = record.route_name || 'N/A';
            const location = record.location || 'N/A';

            const createReceiptLayout = (title: string, photo: string | null, logo: string | null) => [
                {
                    columns: [
                        // Left Column: College Logo
                        {
                            width: 60,
                            stack: [
                                logo ? {
                                    image: logo,
                                    width: 45,
                                    height: 45,
                                    alignment: 'left'
                                } : {
                                    table: {
                                        widths: [45],
                                        heights: [45],
                                        body: [[{ text: 'LOGO', alignment: 'center', fontSize: 8, margin: [0, 15, 0, 0] }]]
                                    },
                                    layout: {
                                        defaultBorder: true
                                    },
                                    alignment: 'left'
                                }
                            ]
                        },
                        // Center Column: College Name and details (center-aligned)
                        {
                            width: '*',
                            stack: [
                                { text: collegeName.toUpperCase(), style: 'collegeName', alignment: 'center' },
                                { text: 'BUS SEVA FEE RECEIPT', style: 'receiptTitle', alignment: 'center' },
                                { text: `(${title})`, style: 'receiptSubtitle', alignment: 'center' }
                            ]
                        },
                        // Right Column: Student Photo (Larger)
                        {
                            width: 60,
                            stack: [
                                photo ? {
                                    image: photo,
                                    width: 60,
                                    height: 70,
                                    alignment: 'right'
                                } : {
                                    table: {
                                        widths: [60],
                                        heights: [70],
                                        body: [[{ text: 'NO\nPHOTO', alignment: 'center', fontSize: 7, margin: [0, 22, 0, 0] }]]
                                    },
                                    layout: {
                                        defaultBorder: true
                                    },
                                    alignment: 'right'
                                }
                            ]
                        }
                    ]
                },
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
                            { text: `Route Name: ${routeName}`, alignment: 'right' }
                        ],
                        [
                            { text: `Location/Stop: ${location}` },
                            { text: `Transaction Reference No: ${record.transaction_number}`, bold: true, alignment: 'right' }
                        ],
                        [
                            { text: '' },
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
                    // Center line positioned exactly in the middle of A4 height (841.89 / 2 = 420.94)
                    {
                        canvas: [
                            {
                                type: 'line',
                                x1: 0, y1: 0,
                                x2: 525, y2: 0,
                                lineWidth: 1,
                                dash: { length: 5, space: 3 }
                            }
                        ],
                        absolutePosition: { x: 35, y: 420.94 }
                    },
                    // STUDENT COPY (top half) - symmetrically aligned
                    {
                        stack: createReceiptLayout('STUDENT COPY', photoBase64, logoBase64),
                        absolutePosition: { x: 35, y: 35 }
                    },
                    // OFFICE COPY (bottom half) - symmetrically aligned
                    {
                        stack: createReceiptLayout('OFFICE COPY', photoBase64, logoBase64),
                        absolutePosition: { x: 35, y: 455.94 }
                    }
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

    onMount(async () => {
        await loadAssets();
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
