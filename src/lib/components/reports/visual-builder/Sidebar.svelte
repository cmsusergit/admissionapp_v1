<script lang="ts">
    let { 
        schema = [], 
        selectedTable = '',
        selectedNode = null,
        layout = [],
        onUpdateNode = () => {},
        onInsertVariable = (detail: any) => {}
    } = $props();

    // Flatten schema into variables with deep relationship support
    let allVariables = $derived.by(() => {
        const vars: { path: string, label: string }[] = [];
        const processedPaths = new Set<string>();
        
        function processTable(table: any, pathPrefix = '', labelPrefix = '', depth = 0) {
            if (!table || depth > 3) return; // Prevent infinite recursion
            
            // Add columns
            table.columns?.forEach((col: any) => {
                const path = pathPrefix ? `${pathPrefix}.${col.name}` : col.name;
                const label = labelPrefix ? `${labelPrefix} > ${col.label}` : col.label;
                
                if (!processedPaths.has(path)) {
                    vars.push({ path, label });
                    processedPaths.add(path);
                    
                    // Add JSON keys if any
                    if (col.jsonKeys) {
                        col.jsonKeys.forEach((jk: any) => {
                            // If column is profile_data or form_data, don't include column name in path
                            const isDataCol = col.name === 'profile_data' || col.name === 'form_data';
                            const finalJPath = isDataCol 
                                ? (pathPrefix ? `${pathPrefix}.${jk.key}` : jk.key)
                                : `${path}.${jk.key}`;

                            if (!processedPaths.has(finalJPath)) {
                                vars.push({ 
                                    path: finalJPath, 
                                    label: `${label} > ${jk.label}` 
                                });
                                processedPaths.add(finalJPath);
                            }
                        });
                    }
                }
            });

            // Relationships
            table.relationships?.forEach((rel: any) => {
                const targetTable = schema.find((t: any) => t.name === rel.targetTable);
                if (!targetTable) return;

                // Map foreign keys to friendly paths based on API flatData conventions
                let relPathPart = '';
                if (rel.foreignKey === 'student_id') relPathPart = 'student';
                else if (rel.foreignKey === 'course_id') relPathPart = 'course';
                else if (rel.foreignKey === 'college_id') relPathPart = 'college';
                else if (rel.foreignKey === 'university_id') relPathPart = 'university';
                else if (rel.foreignKey === 'branch_id') relPathPart = 'branch';
                else if (rel.foreignKey === 'cycle_id') relPathPart = 'cycle';
                else if (rel.foreignKey === 'academic_year_id') relPathPart = 'academic_year';
                else if (rel.foreignKey === 'application_id' && rel.targetTable === 'account_admissions') relPathPart = 'application';
                else if (rel.targetTable === 'student_profiles') {
                    // If we are already in the student (users) scope, don't add another 'student' level
                    relPathPart = pathPrefix.includes('student') ? '' : 'student';
                    
                    // Also add student_profile alias for discoverability if at top level
                    if (depth === 0) {
                        processTable(targetTable, 'student_profile', 'Student Profile', depth + 1);
                    }
                }
                else relPathPart = rel.targetTable;

                const isFirstLevel = depth === 0;
                const fullRelPath = isFirstLevel ? relPathPart : (relPathPart ? `${pathPrefix}.${relPathPart}` : pathPrefix);
                const fullRelLabel = isFirstLevel ? rel.label : (rel.label ? `${labelPrefix} > ${rel.label}` : labelPrefix);

                // Recursive call for relationships
                processTable(targetTable, fullRelPath, fullRelLabel, depth + 1);
            });
        }

        const baseTable = schema.find((t: any) => t.name === selectedTable);
        if (baseTable) {
            // If base table is applications, prefix top-level columns with 'application'
            const prefix = selectedTable === 'applications' ? 'application' : '';
            processTable(baseTable, prefix, prefix);
        }

        // Add virtual fields for discoverability
        if (!processedPaths.has('student.photo_url')) {
            vars.push({ path: 'student.photo_url', label: 'Student > Profile Photo URL' });
        }
        
        return vars;
    });

    let varSearch = $state('');
    let gridRows = $state(2);
    let gridCols = $state(2);

    // Helper to find parent layoutTable of a node
    function findParentTable(nodes: any[], targetId: string, parentTable: any = null): any {
        for (const node of nodes) {
            if (node.id === targetId) return parentTable;
            if (node.children) {
                const found = findParentTable(node.children, targetId, node.type === 'layoutTable' ? node : parentTable);
                if (found) return found;
            }
        }
        return null;
    }

    let parentTable = $derived(selectedNode ? findParentTable(layout, selectedNode.id) : null);
    let tableToEdit = $derived(selectedNode?.type === 'layoutTable' ? selectedNode : parentTable);

    // Sync grid inputs when selection changes
    $effect(() => {
        if (tableToEdit) {
            gridRows = tableToEdit.children.length;
            gridCols = tableToEdit.children[0]?.children.length || 0;
        }
    });

    let filteredVars = $derived(
        varSearch.length > 1 
            ? allVariables.filter(v => 
                v.label.toLowerCase().includes(varSearch.toLowerCase()) || 
                v.path.toLowerCase().includes(varSearch.toLowerCase())
            ).slice(0, 10)
            : []
    );

    const components = [
        { type: 'row', label: 'Row', icon: 'bi-grid-1x2', description: 'Horizontal container' },
        { type: 'column', label: 'Column', icon: 'bi-layout-sidebar', description: 'Vertical container' },
        { type: 'text', label: 'Text', icon: 'bi-type', description: 'Paragraph or Label' },
        { type: 'variable', label: 'Variable', icon: 'bi-braces', description: 'Database field' },
        { type: 'image', label: 'Image', icon: 'bi-image', description: 'Logo or Photo' },
        { type: 'table', label: 'Dynamic Table', icon: 'bi-table', description: 'Dynamic list' },
        { type: 'layoutTable', label: 'Layout Table', icon: 'bi-grid-3x3', description: 'Structural grid' },
        { type: 'divider', label: 'Divider', icon: 'bi-dash-lg', description: 'Horizontal line' }
    ];

    function handleDragStart(event: DragEvent, type: string) {
        if (!event.dataTransfer) return;
        event.dataTransfer.setData('componentType', type);
        event.dataTransfer.effectAllowed = 'move';
        
        const target = event.target as HTMLElement;
        target.classList.add('dragging');
    }

    function handleDragEnd(event: DragEvent) {
        const target = event.target as HTMLElement;
        target.classList.remove('dragging');
    }

    function insertVarIntoNode(path: string) {
        if (!selectedNode) return;
        const insertText = `{{${path}}}`;
        
        if (selectedNode.type === 'text') {
            const textarea = document.getElementById('text-content-editor') as HTMLTextAreaElement;
            if (textarea) {
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                const currentContent = selectedNode.content || '';
                const newContent = currentContent.substring(0, start) + insertText + currentContent.substring(end);
                onUpdateNode({ content: newContent });
                
                setTimeout(() => {
                    textarea.focus();
                    textarea.setSelectionRange(start + insertText.length, start + insertText.length);
                }, 0);
            } else {
                onUpdateNode({ content: (selectedNode.content || '') + insertText });
            }
        } else if (selectedNode.type === 'image') {
            onUpdateNode({ src: insertText });
        } else if (selectedNode.type === 'variable') {
            const v = allVariables.find(v => v.path === path);
            onUpdateNode({ variablePath: path, variableLabel: v?.label || path });
        }
        varSearch = '';
    }

    function addRow() {
        if (!tableToEdit) return;
        const colCount = tableToEdit.children[0]?.children.length || 1;
        const newRow = {
            id: Math.random().toString(36).substr(2, 9),
            type: 'tableRow',
            children: Array(colCount).fill(0).map(() => ({
                id: Math.random().toString(36).substr(2, 9),
                type: 'tableCell',
                children: [],
                style: { padding: '5px', border: tableToEdit.style?.border || '1px dashed #eee' }
            }))
        };
        onUpdateNode({ children: [...tableToEdit.children, newRow] }, tableToEdit.id);
    }

    function removeRow() {
        if (!tableToEdit || tableToEdit.children.length <= 1) return;
        onUpdateNode({ children: tableToEdit.children.slice(0, -1) }, tableToEdit.id);
    }

    function addColumn() {
        if (!tableToEdit) return;
        const newChildren = tableToEdit.children.map((row: any) => ({
            ...row,
            children: [...row.children, {
                id: Math.random().toString(36).substr(2, 9),
                type: 'tableCell',
                children: [],
                style: { padding: '5px', border: tableToEdit.style?.border || '1px dashed #eee' }
            }]
        }));
        onUpdateNode({ children: newChildren }, tableToEdit.id);
    }

    function removeColumn() {
        if (!tableToEdit || tableToEdit.children[0]?.children.length <= 1) return;
        const newChildren = tableToEdit.children.map((row: any) => ({
            ...row,
            children: row.children.slice(0, -1)
        }));
        onUpdateNode({ children: newChildren }, tableToEdit.id);
    }

    function applyGrid() {
        // This is now the non-destructive update function
        if (!tableToEdit) return;
        
        let currentRows = [...tableToEdit.children];
        const targetRows = gridRows;
        const targetCols = gridCols;

        // Adjust Rows
        if (targetRows > currentRows.length) {
            const rowsToAdd = targetRows - currentRows.length;
            for (let i = 0; i < rowsToAdd; i++) {
                currentRows.push({
                    id: Math.random().toString(36).substr(2, 9),
                    type: 'tableRow',
                    children: Array(targetCols).fill(0).map(() => ({
                        id: Math.random().toString(36).substr(2, 9),
                        type: 'tableCell',
                        children: [],
                        style: { padding: '5px', border: tableToEdit.style?.border || '1px dashed #eee' }
                    }))
                });
            }
        } else if (targetRows < currentRows.length) {
            currentRows = currentRows.slice(0, targetRows);
        }

        // Adjust Columns for all rows
        currentRows = currentRows.map(row => {
            let cells = [...row.children];
            if (targetCols > cells.length) {
                const cellsToAdd = targetCols - cells.length;
                for (let i = 0; i < cellsToAdd; i++) {
                    cells.push({
                        id: Math.random().toString(36).substr(2, 9),
                        type: 'tableCell',
                        children: [],
                        style: { padding: '5px', border: tableToEdit.style?.border || '1px dashed #eee' }
                    });
                }
            } else if (targetCols < cells.length) {
                cells = cells.slice(0, targetCols);
            }
            return { ...row, children: cells };
        });

        onUpdateNode({ children: currentRows }, tableToEdit.id);
    }
</script>

<div class="sidebar-content">
    <ul class="nav nav-tabs nav-fill mb-3" role="tablist">
        <li class="nav-item">
            <button type="button" class="nav-link active py-2 small" data-bs-toggle="tab" data-bs-target="#palette-tab" onclick={(e) => e.stopPropagation()}>Palette</button>
        </li>
        <li class="nav-item">
            <button type="button" class="nav-link py-2 small" data-bs-toggle="tab" data-bs-target="#props-tab" disabled={!selectedNode} onclick={(e) => e.stopPropagation()}>Properties</button>
        </li>
    </ul>

    <div class="tab-content">
        <div class="tab-pane fade show active" id="palette-tab">
            <h6 class="small fw-bold mb-3">Layout & Basic</h6>
            <div class="row g-2 mb-4">
                {#each components.filter(c => c.type !== 'variable') as comp}
                    <div class="col-6">
                        <div 
                            class="component-item border rounded p-2 text-center bg-white"
                            draggable="true"
                            ondragstart={(e) => handleDragStart(e, comp.type)}
                            ondragend={handleDragEnd}
                        >
                            <i class="bi {comp.icon} d-block mb-1 fs-5"></i>
                            <span class="x-small fw-bold">{comp.label}</span>
                        </div>
                    </div>
                {/each}
            </div>

            <hr>

            <h6 class="small fw-bold mb-2">Instructions</h6>
            <p class="x-small text-muted mb-2">
                1. Drag components to the canvas.<br>
                2. Select a component to edit properties.<br>
                3. Use the search in <strong>Properties</strong> to bind database fields.
            </p>
        </div>

        <div class="tab-pane fade" id="props-tab">
            {#if selectedNode}
                <div class="property-editor p-1">
                    <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                        <h6 class="small fw-bold mb-0">Editing: {selectedNode.type}</h6>
                        <button type="button" class="btn btn-xs btn-outline-danger border-0" onclick={(e) => { e.stopPropagation(); onUpdateNode({ delete: true }); }} title="Delete Component">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                    
                    <!-- Sizing Group -->
                    {#if selectedNode.type === 'column' || selectedNode.type === 'tableCell'}
                        <div class="prop-group mb-3">
                            <label class="x-small fw-bold text-muted text-uppercase d-block mb-1">
                                Column Width (1-12)
                            </label>
                            <div class="input-group input-group-sm">
                                <input 
                                    type="range" 
                                    class="form-range flex-grow-1 me-2" 
                                    min="1" 
                                    max="12" 
                                    value={selectedNode.width || 12}
                                    oninput={(e) => onUpdateNode({ width: parseInt(e.currentTarget.value) })}
                                >
                                <span class="badge bg-secondary" style="width: 30px;">{selectedNode.width || 12}</span>
                            </div>
                            <div class="xx-small text-muted mt-1">
                                Controls relative width within the row/table.
                            </div>
                        </div>
                    {/if}

                    <!-- Variable Search Autocomplete -->
                    {#if selectedNode.type === 'text' || selectedNode.type === 'image' || selectedNode.type === 'variable'}
                        <div class="prop-group mb-3 position-relative">
                            <label class="x-small fw-bold text-muted text-uppercase d-block mb-1">Bind Variable</label>
                            <div class="input-group input-group-sm">
                                <span class="input-group-text bg-white"><i class="bi bi-search"></i></span>
                                <input 
                                    type="text" 
                                    class="form-control" 
                                    placeholder="Search variable..." 
                                    bind:value={varSearch}
                                >
                            </div>
                            {#if filteredVars.length > 0}
                                <div class="autocomplete-list shadow-sm border rounded mt-1 position-absolute w-100 bg-white" style="z-index: 1000; max-height: 200px; overflow-y: auto;">
                                    {#each filteredVars as v}
                                        <button 
                                            type="button" 
                                            class="list-group-item list-group-item-action p-2 x-small border-0 text-start"
                                            onclick={() => insertVarIntoNode(v.path)}
                                        >
                                            <div class="fw-bold">{v.label}</div>
                                            <div class="text-muted xx-small">{v.path}</div>
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/if}

                    <!-- Content Group -->
                    {#if selectedNode.type === 'text' || selectedNode.type === 'variable' || selectedNode.type === 'image' || selectedNode.type === 'table'}
                        <div class="prop-group mb-3">
                            <label class="x-small fw-bold text-muted text-uppercase d-block mb-1">
                                {selectedNode.type === 'image' ? 'Image Source' : (selectedNode.type === 'table' ? 'Data Source (List Path)' : 'Content')}
                            </label>
                            
                            {#if selectedNode.type === 'text'}
                                <div class="mb-2">
                                    <textarea 
                                        id="text-content-editor"
                                        class="form-control form-control-sm mb-1" 
                                        rows="4" 
                                        value={selectedNode.content} 
                                        oninput={(e) => onUpdateNode({ content: e.currentTarget.value })}
                                        placeholder="Enter text or use &#123;&#123;variable&#125;&#125;"></textarea>
                                    <div class="d-flex justify-content-between align-items-center">
                                        <span class="xx-small text-muted">Use &#123;&#123;variable&#125;&#125; for dynamic data</span>
                                    </div>
                                </div>
                            {:else if selectedNode.type === 'image'}
                                <div class="input-group input-group-sm mb-1">
                                    <input 
                                        type="text" 
                                        class="form-control" 
                                        placeholder="URL or &#123;&#123;variable&#125;&#125;" 
                                        value={selectedNode.src} 
                                        oninput={(e) => onUpdateNode({ src: e.currentTarget.value })}
                                    >
                                </div>
                                <div class="xx-small text-muted">e.g. https://example.com/logo.png or &#123;&#123;college.logo_url&#125;&#125;</div>
                            {:else if selectedNode.type === 'table'}
                                <div class="input-group input-group-sm mb-2">
                                    <input 
                                        type="text" 
                                        class="form-control" 
                                        placeholder="e.g. payments or marks_list" 
                                        value={selectedNode.listPath} 
                                        oninput={(e) => onUpdateNode({ listPath: e.currentTarget.value })}
                                    >
                                </div>
                                
                                <div class="border rounded p-2 bg-light">
                                    <div class="d-flex justify-content-between align-items-center mb-2">
                                        <span class="xx-small fw-bold uppercase">Columns</span>
                                        <button type="button" class="btn btn-xs btn-primary" onclick={() => {
                                            const cols = [...(selectedNode.columns || []), { label: 'New Col', path: '' }];
                                            onUpdateNode({ columns: cols });
                                        }}>+</button>
                                    </div>
                                    {#each (selectedNode.columns || []) as col, idx}
                                        <div class="bg-white border rounded p-1 mb-2 shadow-xs">
                                            <div class="d-flex gap-1 mb-1">
                                                <input type="text" class="form-control form-control-xs xx-small" placeholder="Label" value={col.label} oninput={(e) => {
                                                    const cols = [...selectedNode.columns];
                                                    cols[idx].label = e.currentTarget.value;
                                                    onUpdateNode({ columns: cols });
                                                }}>
                                                <button type="button" class="btn btn-xs btn-outline-danger" onclick={() => {
                                                    const cols = selectedNode.columns.filter((_, i) => i !== idx);
                                                    onUpdateNode({ columns: cols });
                                                }}>&times;</button>
                                            </div>
                                            <input type="text" class="form-control form-control-xs xx-small" placeholder="Path (relative to item)" value={col.path} oninput={(e) => {
                                                const cols = [...selectedNode.columns];
                                                cols[idx].path = e.currentTarget.value;
                                                onUpdateNode({ columns: cols });
                                            }}>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/if}

                    {#if selectedNode.type === 'variable'}
                        <div class="p-2 border rounded bg-white x-small font-monospace mb-3">
                            &#123;&#123;{selectedNode.variablePath}&#125;&#125;
                        </div>
                    {/if}

                    <!-- Conditional Rendering -->
                    <div class="prop-group mb-3 pt-3 border-top">
                        <label class="x-small fw-bold text-muted text-uppercase d-block mb-1">
                            Render Condition
                        </label>
                        <div class="input-group input-group-sm mb-1">
                            <span class="input-group-text xx-small bg-light">If</span>
                            <input
                                type="text"
                                class="form-control xx-small"
                                placeholder="e.g. student.photo_url"
                                value={selectedNode.condition || ''}
                                oninput={(e) => onUpdateNode({ condition: e.currentTarget.value })}
                            >
                        </div>
                        <div class="xx-small text-muted">
                            Component only shows if this variable exists/is true.
                        </div>
                    </div>

                    <!-- Grid Management Group (Show always if part of a table) -->
                    {#if tableToEdit}
                        <div class="border rounded p-2 bg-light mb-3">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <span class="xx-small fw-bold uppercase text-primary">
                                    Grid Management {#if selectedNode.id !== tableToEdit.id}(Parent Table){/if}
                                </span>
                            </div>
                            <div class="row g-2 mb-3">
                                <div class="col-6">
                                    <label class="xx-small fw-bold text-muted d-block">Rows</label>
                                    <div class="input-group input-group-sm">
                                        <input type="number" class="form-control" min="1" max="20" bind:value={gridRows}>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <label class="xx-small fw-bold text-muted d-block">Cols</label>
                                    <div class="input-group input-group-sm">
                                        <input type="number" class="form-control" min="1" max="10" bind:value={gridCols}>
                                    </div>
                                </div>
                                <div class="col-12">
                                    <button type="button" class="btn btn-xs btn-primary w-100" onclick={applyGrid}>
                                        Update Grid Structure
                                    </button>
                                </div>
                            </div>

                            <div class="d-flex justify-content-between align-items-center mb-2 border-top pt-2">
                                <span class="xx-small fw-bold uppercase text-primary">Quick Adjust</span>
                            </div>
                            <div class="row g-2 mb-2">
                                <div class="col-6">
                                    <button type="button" class="btn btn-xs btn-outline-primary w-100" onclick={addRow}>
                                        <i class="bi bi-plus-lg me-1"></i> Row
                                    </button>
                                </div>
                                <div class="col-6">
                                    <button type="button" class="btn btn-xs btn-outline-danger w-100" onclick={removeRow}>
                                        <i class="bi bi-dash-lg me-1"></i> Row
                                    </button>
                                </div>
                            </div>
                            <div class="row g-2">
                                <div class="col-6">
                                    <button type="button" class="btn btn-xs btn-outline-primary w-100" onclick={addColumn}>
                                        <i class="bi bi-plus-lg me-1"></i> Column
                                    </button>
                                </div>
                                <div class="col-6">
                                    <button type="button" class="btn btn-xs btn-outline-danger w-100" onclick={removeColumn}>
                                        <i class="bi bi-dash-lg me-1"></i> Column
                                    </button>
                                </div>
                            </div>
                            
                            <div class="d-flex justify-content-between align-items-center mb-2 border-top pt-2 mt-2">
                                <span class="xx-small fw-bold uppercase text-primary">Table Borders</span>
                            </div>
                            <div class="row g-2">
                                <div class="col-12">
                                    <div class="input-group input-group-sm">
                                        <span class="input-group-text xx-small">Border</span>
                                        <input type="text" class="form-control" placeholder="1px solid #ccc" 
                                            value={tableToEdit.style?.border || ''} 
                                            onchange={(e) => {
                                                const border = e.currentTarget.value;
                                                const newChildren = tableToEdit.children.map((row: any) => ({
                                                    ...row,
                                                    children: row.children.map((cell: any) => ({
                                                        ...cell,
                                                        style: { ...cell.style, border }
                                                    }))
                                                }));
                                                onUpdateNode({ 
                                                    style: { ...tableToEdit.style, border },
                                                    children: newChildren
                                                }, tableToEdit.id);
                                            }}>
                                    </div>
                                </div>
                                <div class="col-12">
                                    <button type="button" class="btn btn-xs btn-outline-secondary w-100" onclick={() => {
                                        const border = '1px solid #000';
                                        const newChildren = tableToEdit.children.map((row: any) => ({
                                            ...row,
                                            children: row.children.map((cell: any) => ({
                                                ...cell,
                                                style: { ...cell.style, border }
                                            }))
                                        }));
                                        onUpdateNode({ 
                                            style: { ...tableToEdit.style, border },
                                            children: newChildren
                                        }, tableToEdit.id);
                                    }}>Solid Black</button>
                                </div>
                                <div class="col-12">
                                    <button type="button" class="btn btn-xs btn-outline-secondary w-100" onclick={() => {
                                        const border = 'none';
                                        const newChildren = tableToEdit.children.map((row: any) => ({
                                            ...row,
                                            children: row.children.map((cell: any) => ({
                                                ...cell,
                                                style: { ...cell.style, border }
                                            }))
                                        }));
                                        onUpdateNode({ 
                                            style: { ...tableToEdit.style, border },
                                            children: newChildren
                                        }, tableToEdit.id);
                                    }}>No Borders</button>
                                </div>
                            </div>
                            <div class="row g-2 mt-2">
                                <div class="col-6">
                                    <div class="form-check form-check-inline mt-1">
                                        <input class="form-check-input" type="checkbox" id="border_collapse" 
                                            checked={tableToEdit.style?.borderCollapse === 'collapse'}
                                            onchange={(e) => onUpdateNode({ style: { ...tableToEdit.style, borderCollapse: e.currentTarget.checked ? 'collapse' : 'separate' } }, tableToEdit.id)}>
                                        <label class="form-check-label xx-small" for="border_collapse">Collapse</label>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="input-group input-group-sm">
                                        <span class="input-group-text xx-small">Pad</span>
                                        <input type="text" class="form-control" placeholder="5px" 
                                            value={tableToEdit.style?.cellPadding || '5px'} 
                                            onchange={(e) => {
                                                const padding = e.currentTarget.value;
                                                const newChildren = tableToEdit.children.map((row: any) => ({
                                                    ...row,
                                                    children: row.children.map((cell: any) => ({
                                                        ...cell,
                                                        style: { ...cell.style, padding }
                                                    }))
                                                }));
                                                onUpdateNode({ 
                                                    style: { ...tableToEdit.style, cellPadding: padding },
                                                    children: newChildren
                                                }, tableToEdit.id);
                                            }}>
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/if}

                    <!-- Layout Group -->
                    <div class="prop-group mb-3">
                        <label class="x-small fw-bold text-muted text-uppercase d-block mb-1">Layout</label>
                        <div class="row g-2">
                            {#if selectedNode.type === 'column'}
                                <div class="col-6">
                                    <div class="input-group input-group-sm">
                                        <span class="input-group-text x-small">W</span>
                                        <input type="number" class="form-control" min="1" max="12" value={selectedNode.width} onchange={(e) => onUpdateNode({ width: parseInt(e.currentTarget.value) })}>
                                    </div>
                                </div>
                            {/if}
                            <div class="col-6">
                                <select class="form-select form-select-sm" value={selectedNode.style?.textAlign || 'left'} onchange={(e) => onUpdateNode({ style: { ...(selectedNode.style || {}), textAlign: e.currentTarget.value } })}>
                                    <option value="left">Align L</option>
                                    <option value="center">Align C</option>
                                    <option value="right">Align R</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Styling Group -->
                    <div class="prop-group mb-3">
                        <label class="x-small fw-bold text-muted text-uppercase d-block mb-1">Spacing & Font</label>
                        <div class="row g-2 mb-2">
                            <div class="col-6">
                                <div class="input-group input-group-sm">
                                    <span class="input-group-text x-small">P</span>
                                    <input type="text" class="form-control" placeholder="10px" value={selectedNode.style?.padding} onchange={(e) => onUpdateNode({ style: { ...(selectedNode.style || {}), padding: e.currentTarget.value } })}>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="input-group input-group-sm">
                                    <span class="input-group-text x-small">M</span>
                                    <input type="text" class="form-control" placeholder="0px" value={selectedNode.style?.margin} onchange={(e) => onUpdateNode({ style: { ...(selectedNode.style || {}), margin: e.currentTarget.value } })}>
                                </div>
                            </div>
                        </div>
                        <div class="row g-2">
                            <div class="col-6">
                                <div class="input-group input-group-sm">
                                    <span class="input-group-text x-small">Size</span>
                                    <input type="text" class="form-control" placeholder="14px" value={selectedNode.style?.fontSize} onchange={(e) => onUpdateNode({ style: { ...(selectedNode.style || {}), fontSize: e.currentTarget.value } })}>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="input-group input-group-sm">
                                    <span class="input-group-text x-small">Z</span>
                                    <input type="number" class="form-control" placeholder="0" value={selectedNode.style?.zIndex} onchange={(e) => onUpdateNode({ style: { ...(selectedNode.style || {}), zIndex: parseInt(e.currentTarget.value) } })}>
                                </div>
                            </div>
                        </div>
                        <div class="row g-2 mt-2">
                            <div class="col-12">
                                <select class="form-select form-select-sm" value={selectedNode.style?.fontWeight || 'normal'} onchange={(e) => onUpdateNode({ style: { ...(selectedNode.style || {}), fontWeight: e.currentTarget.value } })}>
                                    <option value="normal">Normal</option>
                                    <option value="bold">Bold</option>
                                    <option value="300">Light</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Colors Group -->
                    <div class="prop-group mb-3">
                        <label class="x-small fw-bold text-muted text-uppercase d-block mb-1">Appearance</label>
                        <div class="row g-2 mb-2">
                            <div class="col-6">
                                <label class="xx-small d-block text-muted">Text Color</label>
                                <input type="color" class="form-control form-control-sm h-auto p-1" value={selectedNode.style?.color || '#000000'} onchange={(e) => onUpdateNode({ style: { ...(selectedNode.style || {}), color: e.currentTarget.value } })}>
                            </div>
                            <div class="col-6">
                                <label class="xx-small d-block text-muted">BG Color</label>
                                <input type="color" class="form-control form-control-sm h-auto p-1" value={selectedNode.style?.backgroundColor || '#ffffff'} onchange={(e) => onUpdateNode({ style: { ...(selectedNode.style || {}), backgroundColor: e.currentTarget.value } })}>
                            </div>
                        </div>
                        <div class="input-group input-group-sm">
                            <span class="input-group-text x-small">Border</span>
                            <input type="text" class="form-control" placeholder="1px solid #ccc" value={selectedNode.style?.border} onchange={(e) => onUpdateNode({ style: { ...(selectedNode.style || {}), border: e.currentTarget.value } })}>
                        </div>
                    </div>

                    <div class="border-top pt-3 mt-3">
                        <div class="row g-2 mb-2">
                            <div class="col-6">
                                <button type="button" class="btn btn-xs btn-outline-secondary w-100" onclick={(e) => { e.stopPropagation(); onUpdateNode({ style: { ...(selectedNode.style || {}), zIndex: 9999 } }); }}>
                                    <i class="bi bi-layer-forward me-1"></i> Front
                                </button>
                            </div>
                            <div class="col-6">
                                <button type="button" class="btn btn-xs btn-outline-secondary w-100" onclick={(e) => { e.stopPropagation(); onUpdateNode({ style: { ...(selectedNode.style || {}), zIndex: -1 } }); }}>
                                    <i class="bi bi-layer-backward me-1"></i> Back
                                </button>
                            </div>
                        </div>
                        <button type="button" class="btn btn-sm btn-outline-primary w-100 mb-2" onclick={(e) => { e.stopPropagation(); onUpdateNode({ duplicate: true }); }}>
                            <i class="bi bi-layers me-1"></i> Duplicate
                        </button>
                    </div>
                </div>
            {:else}
                <div class="text-center text-muted mt-5 py-5 px-3">
                    <i class="bi bi-cursor-fill fs-3 mb-3 d-block opacity-25"></i>
                    <p class="small">Select a component on the canvas to edit its properties.</p>
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .component-item {
        cursor: grab;
        transition: all 0.2s;
        border-style: dashed !important;
    }
    .component-item:hover {
        border-color: #0d6efd !important;
        background-color: #f8f9ff !important;
        transform: translateY(-2px);
    }
    :global(.dragging) {
        opacity: 0.5;
    }
    .x-small {
        font-size: 0.75rem;
    }
    .xx-small {
        font-size: 0.65rem;
    }
</style>
