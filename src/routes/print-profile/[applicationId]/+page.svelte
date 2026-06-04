<script lang="ts">
    import { onMount } from 'svelte';
    import type { PageData } from './$types';
    import { toastStore } from '$lib/stores/toastStore';
    import { convertHtmlToPdfMake } from '$lib/utils/htmlToPdf';
    import * as pdfMakeLib from "pdfmake/build/pdfmake";
    import * as pdfFontsLib from "pdfmake/build/vfs_fonts";

    const pdfMake: any = (pdfMakeLib as any).default || pdfMakeLib;
    const pdfFonts: any = (pdfFontsLib as any).default || pdfFontsLib;
    if (pdfMake) {
        pdfMake.vfs = pdfFonts?.pdfMake?.vfs || pdfFonts?.vfs || pdfFonts;
    }

    export let data: PageData;

    let compiledHtml = '';
    let loading = true;
    let fetchError = '';
    let isPdfReady = false;
    let pdfDocGenerator: any = null;

    // Dot-notation getter with case-insensitivity support and bracket stripping
    function getNestedValue(obj: any, path: string): any {
        return path.split('.').reduce((acc, part) => {
            if (!acc) return null;
            // Strip brackets for array-like or subject-mapped access (e.g., [math] -> math)
            const cleanPart = part.replace(/^\[|\]$/g, '');
            const key = Object.keys(acc).find(k => k.toLowerCase() === cleanPart.toLowerCase());
            return key && acc[key] !== undefined ? acc[key] : null;
        }, obj);
    }

    async function generatePdf(action: 'print' | 'download' = 'print') {
        if (!pdfDocGenerator) {
            toastStore.error('PDF not ready yet.');
            return;
        }

        if (action === 'download') {
            pdfDocGenerator.download(`${data.templateName.replace(/\s+/g, '_')}_${data.applicationId}.pdf`);
        } else {
            pdfDocGenerator.print();
        }
    }

    onMount(async () => {
        try {
            console.log('Fetching data for Application:', data.applicationId);
            // 1. Fetch the data from the API
            const response = await fetch('/api/reports/profile-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ applicationId: data.applicationId })
            });

            if (!response.ok) {
                const resData = await response.json();
                throw new Error(resData.error || 'Failed to fetch profile data');
            }

            const res = await response.json();
            const profileData = res.data;
            console.log('Profile Data received:', profileData);

            // 2. Interpolate HTML string
            let rawHtml = data.rawHtml;
            console.log('Raw HTML from template:', rawHtml);

            // Handle #if / else logic
            rawHtml = rawHtml.replace(/\{\{\s*#if\s+([a-zA-Z0-9_.!\[\]]+)\s*\}\}([\s\S]*?)(?:\{\{\s*else\s*\}\}([\s\S]*?))?\{\{\s*\/if\s*\}\}/g, (match: string, conditionPath: string, trueBlock: string, falseBlock?: string) => {
                const condition = getNestedValue(profileData, conditionPath);
                if (condition && condition !== 'null' && condition !== 'N/A' && condition !== '') {
                    return trueBlock;
                } else {
                    return falseBlock || '';
                }
            });

            // Replace standard variables - More robust regex
            compiledHtml = rawHtml.replace(/\{\{\s*([a-zA-Z0-9_.!\[\]]+)\s*\}\}/g, (match: string, path: string) => {
                const value = getNestedValue(profileData, path);
                console.log(`Interpolating ${path} -> ${value}`);
                return value !== null && value !== undefined && value !== '' ? String(value) : '';
            });

            console.log('Compiled HTML:', compiledHtml);

            // 3. Prepare PDF
            const content = await convertHtmlToPdfMake(compiledHtml);
            const docDefinition = {
                pageSize: 'A4',
                pageMargins: [0, 0, 0, 0], // Zero margins for absolute positioning to match visual canvas
                content: content,
                defaultStyle: {
                    fontSize: 10
                }
            };

            pdfDocGenerator = pdfMake.createPdf(docDefinition);
            isPdfReady = true;
            loading = false;

        } catch (err: any) {
            console.error('Render error:', err);
            fetchError = err.message;
            toastStore.error(err.message);
            loading = false;
        }
    });
</script>

<svelte:head>
    <title>{data.templateName} - Print Preview</title>
</svelte:head>

<div class="print-container">
    {#if loading}
        <div class="loading-overlay">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="mt-2">Preparing Profile Data...</p>
        </div>
    {:else if fetchError}
        <div class="alert alert-danger m-5 text-center shadow-sm">
            <i class="bi bi-exclamation-triangle display-4 text-danger mb-3 d-block"></i>
            <h4>Error generating report</h4>
            <p class="text-muted">{fetchError}</p>
            <button class="btn btn-primary mt-3" on:click={() => window.location.reload()}>
                <i class="bi bi-arrow-clockwise me-1"></i> Try Again
            </button>
            <button class="btn btn-outline-secondary mt-3 ms-2" on:click={() => window.close()}>Close Window</button>
        </div>
    {:else}
        <div class="controls no-print d-flex justify-content-between align-items-center p-3 bg-white border-bottom sticky-top shadow-sm">
            <div>
                <h5 class="mb-0 fw-bold">{data.templateName}</h5>
                <small class="text-muted">ID: {data.applicationId}</small>
            </div>
            <div class="d-flex gap-2">
                <button class="btn btn-outline-secondary" on:click={() => window.close()}>
                    <i class="bi bi-x-lg me-1"></i> Close
                </button>
                <button class="btn btn-primary px-4" on:click={() => generatePdf('print')} disabled={!isPdfReady}>
                    <i class="bi bi-printer me-1"></i> Print / Save
                </button>
                <button class="btn btn-success" on:click={() => generatePdf('download')} disabled={!isPdfReady}>
                    <i class="bi bi-download me-1"></i> Download
                </button>
            </div>
        </div>

        <div class="preview-wrapper p-4 p-md-5">
            <div class="preview-paper shadow">
                {@html compiledHtml}
            </div>
        </div>
    {/if}
</div>

<style>
    :global(body) {
        background-color: #f0f2f5;
        margin: 0;
        padding: 0;
    }

    .preview-wrapper {
        display: flex;
        justify-content: center;
        min-height: calc(100vh - 75px);
        background-color: #525659; /* PDF-like dark background */
        padding-top: 40px !important;
        padding-bottom: 40px !important;
    }

    .preview-paper {
        background: white;
        width: 210mm;
        height: 297mm;
        padding: 0 !important; /* Zero padding to match designer origin */
        box-sizing: border-box;
        position: relative; /* REQUIRED for absolute elements */
        overflow: hidden;
    }

    .loading-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: white; z-index: 2000;
    }

    @media print {
        .no-print { display: none !important; }
        .preview-wrapper { padding: 0 !important; background: none !important; }
        .preview-paper {
            box-shadow: none !important;
            width: 210mm !important;
            height: 297mm !important;
            padding: 1.5rem !important;
            margin: 0 auto;
        }
    }
</style>
