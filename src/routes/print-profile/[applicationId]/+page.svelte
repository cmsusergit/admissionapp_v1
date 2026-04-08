<script lang="ts">
    import { onMount } from 'svelte';
    import type { PageData } from './$types';
    import { toastStore } from '$lib/stores/toastStore';

    export let data: PageData;

    let compiledHtml = '';
    let loading = true;
    let fetchError = '';

    // Simple dot-notation getter
    function getNestedValue(obj: any, path: string): any {
        return path.split('.').reduce((acc, part) => acc && acc[part] !== undefined ? acc[part] : null, obj);
    }

    onMount(async () => {
        try {
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

            const { data: profileData } = await response.json();

            // 2. Interpolate HTML string
            // Replaces Handlebars style tags: {{student.name}}, {{marks.math.obtained}}, {{#if photo_url}}...{{else}}...{{/if}}
            
            let rawHtml = data.rawHtml;

            // Very basic #if / else handler specifically for photo (or boolean checks)
            // Note: This regex is fragile for complex nested logic but works for simple existence checks like {{#if student.photo_url}}...{{else}}...{{/if}}
            rawHtml = rawHtml.replace(/\{\{#if\s+([a-zA-Z0-9_.]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (match, conditionPath, trueBlock, falseBlock) => {
                const condition = getNestedValue(profileData, conditionPath);
                if (condition && condition !== 'null' && condition !== 'N/A' && condition !== '') {
                    return trueBlock;
                } else {
                    return falseBlock || '';
                }
            });

            // Replace standard variables {{some.path}}
            compiledHtml = rawHtml.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, path) => {
                const value = getNestedValue(profileData, path);
                return value !== null && value !== undefined ? String(value) : '';
            });

            loading = false;

            // 3. Trigger Print
            setTimeout(() => {
                window.print();
            }, 800); // Give images a moment to load

        } catch (err: any) {
            console.error('Render error:', err);
            fetchError = err.message;
            toastStore.error(err.message);
            loading = false;
        }
    });
</script>

<svelte:head>
    <title>{data.templateName} - Print</title>
</svelte:head>

{#if loading}
    <div style="display:flex; justify-content:center; align-items:center; height: 100vh;">
        <p>Loading Profile Data for Printing...</p>
    </div>
{:else if fetchError}
    <div style="padding: 20px; color: red;">
        <h3>Error generating report</h3>
        <p>{fetchError}</p>
    </div>
{:else}
    <!-- Inject compiled HTML. The styling is embedded within the HTML payload by the Admin. -->
    <div class="print-wrapper">
        {@html compiledHtml}
    </div>
{/if}

<style>
    /* Ensure the print wrapper resets styles so the injected HTML controls layout */
    .print-wrapper {
        width: 100%;
        background: white;
    }
    
    @media print {
        @page {
            size: A4;
            margin: 10mm; /* Admin can override margins with their own CSS if needed, but a base is good */
        }
        :global(body) {
            margin: 0;
            padding: 0;
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
    }
</style>
