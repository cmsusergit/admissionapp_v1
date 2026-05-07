<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import SchemaTree from './SchemaTree.svelte'; 

    export let tableName: string;
    export let currentPath: string = ''; // e.g. 'users!student_id'
    export let schema: any[];
    export let selectedColumns: any[] = [];

    const dispatch = createEventDispatcher();

    $: tableDef = schema.find(t => t.name === tableName);
    
    // UI State for expansion
    let expanded = false;

    function toggle(path: string, label: string) {
        dispatch('toggle', { path, label });
    }
    
    function forwardToggle(event: CustomEvent) {
        dispatch('toggle', event.detail);
    }
</script>

<div class="ms-2 border-start ps-2 mb-2">
    <div class="d-flex align-items-center mb-1">
        {#if tableDef?.relationships?.length > 0}
            <button class="btn btn-sm btn-link p-0 me-1 text-decoration-none text-dark" style="font-size: 0.8rem; width: 15px;" on:click|preventDefault={() => expanded = !expanded}>
                {expanded ? '▼' : '▶'}
            </button>
        {:else}
            <span style="width: 15px; display: inline-block;"></span>
        {/if}
        <span class="fw-bold small text-primary">{tableDef?.label || tableName}</span>
    </div>

    <!-- Columns -->
    {#if tableDef}
        {#each tableDef.columns as col}
            {@const fullPath = currentPath ? `${currentPath}.${col.name}` : col.name}
            <div class="form-check ms-4">
                <input class="form-check-input" type="checkbox" id={fullPath}
                    checked={selectedColumns.some(c => c.path === fullPath)}
                    on:change={() => toggle(fullPath, `${tableDef.label} - ${col.label}`)}
                >
                <label class="form-check-label small" for={fullPath}>{col.label}</label>
            </div>

            {#if col.type === 'json' && col.jsonKeys?.length}
                {#each col.jsonKeys as jsonKey}
                    {@const nestedPath = `${fullPath}.${jsonKey.key}`}
                    <div class="form-check ms-5">
                        <input class="form-check-input" type="checkbox" id={nestedPath}
                            checked={selectedColumns.some(c => c.path === nestedPath)}
                            on:change={() => toggle(nestedPath, `${tableDef.label} - ${col.label}: ${jsonKey.label}`)}
                        >
                        <label class="form-check-label small" for={nestedPath}>{jsonKey.label}</label>
                    </div>
                {/each}
            {/if}
        {/each}

        <!-- Recursive Relations -->
        {#if expanded}
            {#each tableDef.relationships as rel}
                {@const nextPath = currentPath 
                    ? `${currentPath}.${rel.targetTable}!${rel.foreignKey}` 
                    : `${rel.targetTable}!${rel.foreignKey}` 
                }
                <div class="mt-2 ms-3">
                    <small class="text-muted text-uppercase fw-bold" style="font-size: 0.7rem;">via {rel.label}</small>
                    <SchemaTree 
                        tableName={rel.targetTable} 
                        currentPath={nextPath} 
                        {schema} 
                        {selectedColumns} 
                        on:toggle={forwardToggle} 
                    />
                </div>
            {/each}
        {/if}
    {:else}
        <div class="text-danger small ms-4">Table definition not found: {tableName}</div>
    {/if}
</div>
