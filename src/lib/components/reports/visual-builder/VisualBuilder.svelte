<script lang="ts">
    import Sidebar from './Sidebar.svelte';
    import CanvasNode from './CanvasNode.svelte';

    // Props using Svelte 5 runes
    let { 
        layout = $bindable([]), 
        htmlContent = $bindable(''), 
        schema = [], 
        selectedTable = '',
        live = false
    } = $props();

    // Internal state
    let previewMode = $state(false);
    let selectedId = $state('');
    let rootIsOver = $state(false);
    let zoom = $state(1);
    let showSidebar = $state(true);
    let lastCompiledHtml = $state('');

    function generateId() {
        return Math.random().toString(36).substr(2, 9);
    }

    function findAndAdd(nodes: any[], targetId: string, newNode: any): boolean {
        for (let node of nodes) {
            if (node.id === targetId) {
                if (node.type === 'row' || node.type === 'column' || node.type === 'tableCell') {
                    node.children = [...node.children, newNode];
                    return true;
                }
            }
            if (node.children && findAndAdd(node.children, targetId, newNode)) {
                return true;
            }
        }
        return false;
    }

    function findNode(nodes: any[], id: string): any {
        for (let node of nodes) {
            if (node.id === id) return node;
            if (node.children) {
                const found = findNode(node.children, id);
                if (found) return found;
            }
        }
        return null;
    }

    function onDrop(targetId: string, type: string, data: any) {
        const isRoot = targetId === 'root';
        const isReparent = type === 'reparent';
        
        let nodeToProcess: any;
        
        if (isReparent) {
            const originalNode = findNode(layout, data.nodeId);
            if (!originalNode) return;
            
            // Prevent dropping a parent into its own child
            if (isDescendant(originalNode, targetId)) {
                return;
            }
            
            nodeToProcess = JSON.parse(JSON.stringify(originalNode));
            // Remove from old parent first
            layout = removeNodeFromLayout(layout, data.nodeId);
        } else {
            nodeToProcess = {
                id: generateId(),
                type,
                children: (type === 'row' || type === 'column') ? [] : undefined,
                style: {
                    width: '100%',
                    height: 'auto',
                    padding: '5px',
                    margin: '0px',
                    fontSize: '12px'
                }
            };

            if (type === 'variable') {
                nodeToProcess.variablePath = data.variablePath;
                nodeToProcess.variableLabel = data.variableLabel;
            } else if (type === 'text') {
                nodeToProcess.content = 'Hello There';
            } else if (type === 'image') {
                nodeToProcess.src = '{{college.logo_url}}';
            } else if (type === 'table') {
                nodeToProcess.listPath = 'payments';
                nodeToProcess.columns = [
                    { label: 'Date', path: 'created_at' },
                    { label: 'Amount', path: 'amount' },
                    { label: 'Status', path: 'status' }
                ];
                nodeToProcess.style.width = '100%';
            } else if (type === 'layoutTable') {
                nodeToProcess.children = [0, 1].map(() => ({
                    id: generateId(),
                    type: 'tableRow',
                    children: [0, 1].map(() => ({
                        id: generateId(),
                        type: 'tableCell',
                        children: [],
                        style: { padding: '5px', border: '1px dashed #ccc' }
                    }))
                }));
                nodeToProcess.style.width = '100%';
                nodeToProcess.style.borderCollapse = 'collapse';
            }
        }

        // Apply placement-specific adjustments
        if (isRoot) {
            nodeToProcess.x = data.x || 20;
            nodeToProcess.y = data.y || 20;
            nodeToProcess.w = nodeToProcess.w || (type === 'image' ? 150 : 200);
            nodeToProcess.h = nodeToProcess.h || (type === 'image' ? 150 : 40);
            nodeToProcess.style.position = 'absolute';
            nodeToProcess.style.left = `${nodeToProcess.x}px`;
            nodeToProcess.style.top = `${nodeToProcess.y}px`;
            
            layout = [...layout, nodeToProcess];
        } else {
            // Nested: Strip absolute positioning
            delete nodeToProcess.x;
            delete nodeToProcess.y;
            nodeToProcess.style.position = 'relative';
            nodeToProcess.style.left = undefined;
            nodeToProcess.style.top = undefined;
            nodeToProcess.style.width = nodeToProcess.style.width || '100%';

            const newLayout = JSON.parse(JSON.stringify(layout));
            if (findAndAdd(newLayout, targetId, nodeToProcess)) {
                layout = newLayout;
            }
        }
        
        selectedId = nodeToProcess.id;
        compile();
    }

    function isDescendant(parent: any, childId: string): boolean {
        if (!parent.children) return false;
        for (const child of parent.children) {
            if (child.id === childId) return true;
            if (isDescendant(child, childId)) return true;
        }
        return false;
    }

    function removeNodeFromLayout(nodes: any[], nodeId: string): any[] {
        return nodes.filter(n => {
            if (n.id === nodeId) return false;
            if (n.children) {
                n.children = removeNodeFromLayout(n.children, nodeId);
            }
            return true;
        });
    }

    function handleRootDragOver(e: DragEvent) {
        e.preventDefault();
        rootIsOver = true;
    }

    function handleRootDrop(e: DragEvent) {
        e.preventDefault();
        rootIsOver = false;
        
        const type = e.dataTransfer?.getData('componentType');
        const nodeId = e.dataTransfer?.getData('nodeId');
        const variablePath = e.dataTransfer?.getData('variablePath');
        const variableLabel = e.dataTransfer?.getData('variableLabel');
        
        // Calculate drop position relative to canvas
        const canvas = e.currentTarget as HTMLElement;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / zoom;
        const y = (e.clientY - rect.top) / zoom;

        if (nodeId) {
            onDrop('root', 'reparent', { nodeId, x: Math.round(x), y: Math.round(y) });
        } else if (type) {
            onDrop('root', type, { variablePath, variableLabel, x: Math.round(x), y: Math.round(y) });
        }
    }

    function handleSelect(id: string) {
        // Just select the node. The new move handles in CanvasNode.svelte
        // handle the parent selection/moving for layoutTables.
        selectedId = id;
    }

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

    function compileNode(node: any): string {
        let styleStr = '';
        const combinedStyle = { ...node.style };
        
        // Use absolute positioning for top-level, relative for nested
        if (node.x !== undefined && node.y !== undefined) {
            combinedStyle.position = 'absolute';
            combinedStyle.left = `${node.x}px`;
            combinedStyle.top = `${node.y}px`;
            if (node.w) {
                combinedStyle.width = `${node.w}px`;
            }
            if (node.h && node.type !== 'text') {
                combinedStyle.height = `${node.h}px`;
            }
        } else {
            // Nested elements
            combinedStyle.position = 'relative';
            if (node.type !== 'tableCell' && node.type !== 'tableRow' && node.type !== 'layoutTable') {
                combinedStyle.width = combinedStyle.width || '100%';
            }
        }

        if (combinedStyle) {
            Object.entries(combinedStyle).forEach(([k, v]) => {
                if (v === undefined || v === null) return;
                const cssKey = k.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
                styleStr += `${cssKey}:${v};`;
            });
        }

        let innerHtml = '';
        switch (node.type) {
            case 'row':
                innerHtml = `<div class="row g-0" style="min-height:20px; ${styleStr}">${node.children.map(compileNode).join('')}</div>`;
                break;
            case 'column':
                innerHtml = `<div class="col-md-${node.width || 12}" style="min-height:10px; ${styleStr}">${node.children.map(compileNode).join('')}</div>`;
                break;
            case 'text':
                innerHtml = `<div style="${styleStr}">${node.content || ''}</div>`;
                break;
            case 'variable':
                innerHtml = `<span style="${styleStr}">{{${node.variablePath}}}</span>`;
                break;
            case 'image':
                innerHtml = `<img src="${node.src || '{{college.logo_url}}'}" style="${styleStr} object-fit:contain;">`;
                break;
            case 'table':
                const headers = (node.columns || []).map((c: any) => `<th style="border:1px solid #dee2e6; padding:8px; background-color:#f8f9fa;">${c.label}</th>`).join('');
                const cells = (node.columns || []).map((c: any) => `<td style="border:1px solid #dee2e6; padding:8px;">{{${c.path}}}</td>`).join('');
                innerHtml = `
                    <table style="width:100%; border-collapse:collapse; ${styleStr}">
                        <thead><tr>${headers}</tr></thead>
                        <tbody>
                            {{#each ${node.listPath}}}
                            <tr>${cells}</tr>
                            {{/each}}
                        </tbody>
                    </table>`;
                break;
            case 'layoutTable':
                innerHtml = `<table style="width:100%; table-layout:fixed; border-collapse:${node.style?.borderCollapse || 'collapse'}; ${styleStr}">${node.children.map(compileNode).join('')}</table>`;
                break;
            case 'tableRow':
                innerHtml = `<tr>${node.children.map(compileNode).join('')}</tr>`;
                break;
            case 'tableCell':
                const cellWidth = node.width ? `${((node.width / 12) * 100).toFixed(2)}%` : '';
                const widthStyle = cellWidth ? `width:${cellWidth};` : '';
                innerHtml = `<td style="position:relative; ${widthStyle} ${styleStr}">${node.children.map(compileNode).join('')}</td>`;
                break;
            case 'divider':
                innerHtml = `<hr style="${styleStr}">`;
                break;
            default:
                innerHtml = '';
        }

        // Apply conditional rendering wrapper if condition is defined
        if (node.condition && node.condition.trim()) {
            return `{{#if ${node.condition.trim()}}}${innerHtml}{{/if}}`;
        }
        
        return innerHtml;
    }

    function compile() {
        const compiled = layout.map(compileNode).join('');
        lastCompiledHtml = compiled;
        htmlContent = compiled;
    }

    // Detect if htmlContent was changed externally (e.g. from the Code tab)
    let isExternalChange = $derived(htmlContent !== lastCompiledHtml && layout.length > 0);

    function deleteNode(targetId?: string) {
        const id = targetId || selectedId;
        if (!id) return;
        
        function filterNodes(nodes: any[]) {
            return nodes.filter(n => {
                if (n.id === id) return false;
                if (n.children) n.children = filterNodes(n.children);
                return true;
            });
        }
        
        layout = filterNodes(JSON.parse(JSON.stringify(layout)));
        if (id === selectedId) selectedId = '';
        compile();
    }

    function resetLayout() {
        if (confirm('Are you sure you want to clear the entire design?')) {
            layout = [];
            selectedId = '';
            compile();
        }
    }

    function importLayout() {
        const json = prompt('Paste your Visual Layout JSON here:');
        if (json) {
            try {
                const parsed = JSON.parse(json);
                if (Array.isArray(parsed)) {
                    layout = parsed;
                    compile();
                    alert('Layout imported successfully!');
                } else {
                    alert('Invalid format: Expected a JSON array.');
                }
            } catch (e) {
                alert('Invalid JSON: ' + (e as Error).message);
            }
        }
    }

    // Drag and Resize State
    let dragState = $state({
        activeId: '',
        type: '' as 'move' | 'resize' | '',
        resizeDir: '',
        startX: 0,
        startY: 0,
        initialX: 0,
        initialY: 0,
        initialW: 0,
        initialH: 0
    });

    let guidelines = $state<{ x?: number, y?: number }[]>([]);
    const SNAP_THRESHOLD = 5;

    function startAction(nodeId: string, type: 'move' | 'resize', event: MouseEvent, dir = '') {
        const node = findNode(layout, nodeId);
        if (!node) return;

        dragState = {
            activeId: nodeId,
            type,
            resizeDir: dir,
            startX: event.clientX,
            startY: event.clientY,
            initialX: node.x || 0,
            initialY: node.y || 0,
            initialW: node.w || 100,
            initialH: node.h || 40
        };

        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);
        event.stopPropagation();
    }

    function handleGlobalMouseMove(e: MouseEvent) {
        if (!dragState.activeId) return;

        const dx = (e.clientX - dragState.startX) / zoom;
        const dy = (e.clientY - dragState.startY) / zoom;
        
        let newX = dragState.initialX + dx;
        let newY = dragState.initialY + dy;
        let newW = dragState.initialW + dx;
        let newH = dragState.initialH + dy;
        
        const activeNode = findNode(layout, dragState.activeId);
        if (!activeNode) return;

        const currentW = activeNode.w || 100;
        const currentH = activeNode.h || 40;
        
        guidelines = [];

        if (dragState.type === 'move') {
            const canvasWidth = 210 * 3.7795275591;
            const canvasHeight = 297 * 3.7795275591;
            
            const targetsX = [0, canvasWidth / 2, canvasWidth]; 
            const targetsY = [0, canvasHeight / 2, canvasHeight];

            // Add other nodes to snap targets
            layout.forEach(n => {
                if (n.id === dragState.activeId || n.x === undefined) return;
                targetsX.push(n.x, n.x + (n.w || 0), n.x + (n.w || 0) / 2);
                targetsY.push(n.y, n.y + (n.h || 0), n.y + (n.h || 0) / 2);
            });

            // Check X snapping
            for (const tx of targetsX) {
                if (Math.abs(newX - tx) < SNAP_THRESHOLD) {
                    newX = tx;
                    guidelines.push({ x: tx });
                }
                else if (Math.abs((newX + currentW / 2) - tx) < SNAP_THRESHOLD) {
                    newX = tx - currentW / 2;
                    guidelines.push({ x: tx });
                }
                else if (Math.abs((newX + currentW) - tx) < SNAP_THRESHOLD) {
                    newX = tx - currentW;
                    guidelines.push({ x: tx });
                }
            }

            // Check Y snapping
            for (const ty of targetsY) {
                if (Math.abs(newY - ty) < SNAP_THRESHOLD) {
                    newY = ty;
                    guidelines.push({ y: ty });
                }
                else if (Math.abs((newY + currentH / 2) - ty) < SNAP_THRESHOLD) {
                    newY = ty - currentH / 2;
                    guidelines.push({ y: ty });
                }
                else if (Math.abs((newY + currentH) - ty) < SNAP_THRESHOLD) {
                    newY = ty - currentH;
                    guidelines.push({ y: ty });
                }
            }

            updateSelectedNode({ x: Math.round(newX), y: Math.round(newY) });

        } else if (dragState.type === 'resize') {
            const dir = dragState.resizeDir;
            let finalX = dragState.initialX;
            let finalY = dragState.initialY;
            let finalW = dragState.initialW;
            let finalH = dragState.initialH;

            // Apply delta
            if (dir.includes('e')) finalW = dragState.initialW + dx;
            if (dir.includes('s')) finalH = dragState.initialH + dy;
            if (dir.includes('w')) {
                const deltaW = Math.min(dragState.initialW - 20, dx);
                finalW = dragState.initialW - deltaW;
                finalX = dragState.initialX + deltaW;
            }
            if (dir.includes('n')) {
                const deltaH = Math.min(dragState.initialH - 20, dy);
                finalH = dragState.initialH - deltaH;
                finalY = dragState.initialY + deltaH;
            }

            // SNAPPING FOR RESIZE
            const targetsX = [0, (210 * 3.7795275591) / 2, 210 * 3.7795275591];
            const targetsY = [0, (297 * 3.7795275591) / 2, 297 * 3.7795275591];

            layout.forEach(n => {
                if (n.id === dragState.activeId || n.x === undefined) return;
                targetsX.push(n.x, n.x + (n.w || 0), n.x + (n.w || 0) / 2);
                targetsY.push(n.y, n.y + (n.h || 0), n.y + (n.h || 0) / 2);
            });

            if (dir.includes('e')) {
                for (const tx of targetsX) {
                    if (Math.abs((finalX + finalW) - tx) < SNAP_THRESHOLD) {
                        finalW = tx - finalX;
                        guidelines.push({ x: tx });
                    }
                }
            }
            if (dir.includes('w')) {
                for (const tx of targetsX) {
                    if (Math.abs(finalX - tx) < SNAP_THRESHOLD) {
                        const delta = tx - finalX;
                        finalX = tx;
                        finalW -= delta;
                        guidelines.push({ x: tx });
                    }
                }
            }
            if (dir.includes('s')) {
                for (const ty of targetsY) {
                    if (Math.abs((finalY + finalH) - ty) < SNAP_THRESHOLD) {
                        finalH = ty - finalY;
                        guidelines.push({ y: ty });
                    }
                }
            }
            if (dir.includes('n')) {
                for (const ty of targetsY) {
                    if (Math.abs(finalY - ty) < SNAP_THRESHOLD) {
                        const delta = ty - finalY;
                        finalY = ty;
                        finalH -= delta;
                        guidelines.push({ y: ty });
                    }
                }
            }

            updateSelectedNode({
                x: Math.round(finalX),
                y: Math.round(finalY),
                w: Math.round(finalW),
                h: Math.round(finalH)
            });
        }
    }

    function updateSelectedNode(updates: any, targetId?: string) {
        const id = targetId || selectedId;
        if (!id) return;

        const targetNode = findNode(layout, id);
        // If node is nested (x,y are undefined), don't allow updates to add x,y
        // This prevents relative components from suddenly becoming absolute during resize
        if (targetNode && targetNode.x === undefined) {
            delete updates.x;
            delete updates.y;
        }
        
        if (updates.delete) {
            deleteNode(id);
            return;
        }

        if (updates.duplicate) {
            const nodeToDuplicate = findNode(layout, id);
            if (nodeToDuplicate) {
                const newNode = JSON.parse(JSON.stringify(nodeToDuplicate));
                newNode.id = generateId();
                layout = [...layout, newNode];
                selectedId = newNode.id;
            }
            compile();
            return;
        }
        
        function updateNodes(nodes: any[]) {
            return nodes.map(n => {
                if (n.id === id) {
                    return { ...n, ...updates };
                }
                if (n.children) {
                    return { ...n, children: updateNodes(n.children) };
                }
                return n;
            });
        }
        
        layout = updateNodes(JSON.parse(JSON.stringify(layout)));
        compile();
    }

    function handleGlobalMouseUp() {
        dragState = { activeId: '', type: '', resizeDir: '', startX: 0, startY: 0, initialX: 0, initialY: 0, initialW: 0, initialH: 0 };
        guidelines = [];
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
    }

    let selectedNode = $derived(findNode(layout, selectedId));
    
    // Multi-page indicators
    const A4_HEIGHT_PX = 297 * 3.7795275591;
    let pageCount = $derived(Math.max(1, Math.ceil((layout.reduce((max, n) => Math.max(max, (n.y || 0) + (n.h || 0)), 0) + 50) / A4_HEIGHT_PX)));
</script>

<div class="visual-builder-container border rounded bg-white" style="min-height: 800px;">
    <div class="toolbar p-2 border-bottom bg-dark d-flex justify-content-between align-items-center">
        <div class="d-flex align-items-center gap-3">
            <button 
                type="button" 
                class="btn btn-xs {showSidebar ? 'btn-primary' : 'btn-outline-light'} py-0" 
                onclick={() => showSidebar = !showSidebar}
                title="Toggle Sidebar"
            >
                <i class="bi {showSidebar ? 'bi-layout-sidebar-inset' : 'bi-layout-sidebar'}"></i>
            </button>
            {#if layout.length === 0 && htmlContent}
                <span class="badge bg-warning text-dark"><i class="bi bi-eye-fill me-1"></i> Live Code Preview</span>
            {:else if isExternalChange}
                <span class="badge bg-info text-white" title="The HTML code has been modified manually. Click Preview to see changes.">
                    <i class="bi bi-pencil-square me-1"></i> Code Modified
                </span>
            {:else}
                <span class="badge bg-primary text-white">Visual Mode</span>
            {/if}
            {#if selectedId}
                <button type="button" class="btn btn-xs btn-outline-danger py-0" onclick={(e) => { e.stopPropagation(); deleteNode(); }} title="Delete Selected">
                    <i class="bi bi-trash"></i> Delete
                </button>
            {/if}
            {#if layout.length > 0}
                <button type="button" class="btn btn-xs btn-outline-warning py-0 ms-1" onclick={(e) => { e.stopPropagation(); resetLayout(); }} title="Clear All">
                    <i class="bi bi-arrow-counterclockwise"></i> Reset
                </button>
            {/if}
            <button type="button" class="btn btn-xs btn-outline-info py-0 ms-1" onclick={(e) => { e.stopPropagation(); importLayout(); }} title="Import Visual Layout">
                <i class="bi bi-box-arrow-in-down"></i> Import
            </button>
            <div class="d-flex align-items-center ms-3">
                <i class="bi bi-zoom-out text-light me-2 x-small"></i>
                <input type="range" class="form-range" min="0.5" max="1.5" step="0.1" bind:value={zoom} oninput={(e) => e.stopPropagation()} style="width: 100px;">
                <i class="bi bi-zoom-in text-light ms-2 x-small"></i>
                <span class="text-light ms-2 x-small">{Math.round(zoom * 100)}%</span>
            </div>
        </div>
        <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-outline-light" class:active={!previewMode} onclick={() => previewMode = false}>Design</button>
            <button type="button" class="btn btn-outline-light position-relative" class:active={previewMode} onclick={() => previewMode = true}>
                Preview
                {#if isExternalChange && !previewMode}
                    <span class="position-absolute top-0 start-100 translate-middle p-1 bg-danger border border-light rounded-circle">
                        <span class="visually-hidden">New changes</span>
                    </span>
                {/if}
            </button>
        </div>
    </div>

    <div class="builder-body position-relative">
        <!-- Sidebar Drawer -->
        <div class="sidebar-drawer border-end bg-light" class:active={showSidebar}>
            <div class="drawer-handle d-flex align-items-center justify-content-center text-muted" onclick={() => showSidebar = !showSidebar}>
                <i class="bi {selectedId ? 'bi-gear-fill text-primary' : (showSidebar ? 'bi-chevron-left' : 'bi-chevron-right')}"></i>
            </div>
            <div class="drawer-content p-3">
                {#if layout.length > 0 || (layout.length === 0 && !htmlContent)}
                    <Sidebar 
                        {schema} 
                        {selectedTable} 
                        {layout}
                        selectedNode={selectedNode} 
                        onUpdateNode={updateSelectedNode}
                        onInsertVariable={(detail: any) => onDrop('root', 'variable', detail)}
                    />
                {:else}
                    <div class="text-center text-muted mt-5">
                        <i class="bi bi-code-square display-6 mb-3"></i>
                        <p class="small px-3">Visual tools are disabled while viewing raw HTML. Use <strong>Design</strong> mode with a layout to enable drag-and-drop.</p>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Main Workspace -->
        <div class="workspace-viewport" style="height: 800px; width: 100%;">
            {#if previewMode || live || (layout.length === 0 && htmlContent)}
                <div 
                    class="canvas-paper shadow" 
                    style="overflow-x: hidden; min-height: 297mm; position: relative; transform: scale({zoom}); transform-origin: top center;"
                >
                    <div class="p-0">
                        {@html htmlContent}
                    </div>
                    <div class="page-boundary-indicator" style:top="{A4_HEIGHT_PX}px"></div>
                    <div class="page-boundary-label" style:top="{A4_HEIGHT_PX - 20}px">End of A4 Page (297mm)</div>
                </div>
            {:else}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                    class="canvas-paper shadow show-grid" 
                    class:drag-over={rootIsOver}
                    style:transform="scale({zoom})"
                    style:transform-origin="top center"
                    style:height="{pageCount * A4_HEIGHT_PX}px"
                    style:padding="0"
                    ondragover={handleRootDragOver}
                    ondragleave={() => rootIsOver = false}
                    ondrop={handleRootDrop}
                    onclick={() => selectedId = ''}
                >
                    <div class="print-margin-guide"></div>
                    {#if layout.length === 0}
                        <div class="text-center text-muted mt-5 py-5 border-dashed border-2 rounded mx-5">
                            <i class="bi bi-plus-circle display-4"></i>
                            <p class="mt-2">Drag components from the sidebar to start designing.</p>
                        </div>
                    {:else}
                        <div style="position: relative; width: 100%; height: 100%;">
                            {#each layout as node (node.id)}
                                <CanvasNode 
                                    {node} 
                                    onSelect={handleSelect} 
                                    {onDrop} 
                                    {selectedId} 
                                    {zoom} 
                                    onUpdateNode={updateSelectedNode}
                                    onStartAction={startAction}
                                    onCancelAction={handleGlobalMouseUp}
                                    isDragging={dragState.activeId === node.id}
                                />
                            {/each}

                            <!-- Page Boundaries -->
                            {#each Array(pageCount) as _, i}
                                <div class="page-boundary-indicator" style:top="{(i + 1) * A4_HEIGHT_PX}px"></div>
                                <div class="page-boundary-label" style:top="{(i + 1) * A4_HEIGHT_PX - 20}px">Page {i + 1} End</div>
                            {/each}

                            <!-- Alignment Guidelines -->
                            {#each guidelines as guide}
                                {#if guide.x !== undefined}
                                    <div class="guideline vertical" style:left="{guide.x}px"></div>
                                {/if}
                                {#if guide.y !== undefined}
                                    <div class="guideline horizontal" style:top="{guide.y}px"></div>
                                {/if}
                            {/each}

                        </div>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</div>

<style>
    .visual-builder-container {
        display: flex;
        flex-direction: column;
        background-color: #f8f9fa;
        overflow: hidden;
    }
    .builder-body {
        display: flex;
        flex-direction: row;
        height: 800px;
        overflow: hidden;
    }
    .sidebar-drawer {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 320px;
        z-index: 1050;
        background: #f8f9fa;
        box-shadow: 2px 0 10px rgba(0,0,0,0.1);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        transform: translateX(-300px);
    }
    .sidebar-drawer.active {
        transform: translateX(0);
    }
    .drawer-handle {
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        width: 20px;
        background-color: #f1f1f1;
        cursor: pointer;
        border-left: 1px solid #dee2e6;
        font-size: 12px;
        transition: background-color 0.2s;
    }
    .drawer-handle:hover {
        background-color: #e9ecef;
    }
    .drawer-content {
        height: 100%;
        overflow-y: auto;
        width: 300px;
    }
    .workspace-viewport {
        flex: 1;
        background-color: #e5e5e5;
        overflow: auto;
        padding: 60px;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        position: relative;
    }
    .canvas-paper {
        background-color: white;
        width: 210mm;
        min-height: 297mm;
        box-shadow: 0 0 20px rgba(0,0,0,0.15);
        position: relative;
        transition: transform 0.2s ease;
        padding: 0 !important;
        font-size: 12px;
    }
    .canvas-paper.show-grid {
        /* Grid Pattern */
        background-image: linear-gradient(to right, #f0f0f0 1px, transparent 1px),
                          linear-gradient(to bottom, #f0f0f0 1px, transparent 1px);
        background-size: 10px 10px;
    }
    .print-margin-guide {
        position: absolute;
        top: 10mm;
        left: 10mm;
        right: 10mm;
        bottom: 10mm;
        border: 1px dashed rgba(13, 110, 253, 0.2);
        pointer-events: none;
        z-index: 1;
    }
    .page-boundary-indicator {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 2px;
        border-bottom: 2px dashed #ff4d4d;
        z-index: 100;
        pointer-events: none;
    }
    .page-boundary-label {
        position: absolute;
        bottom: 5px;
        right: 10px;
        font-size: 10px;
        color: #ff4d4d;
        font-weight: bold;
        z-index: 100;
        pointer-events: none;
        text-transform: uppercase;
    }
    .guideline {
        position: absolute;
        background-color: #ff00ff;
        z-index: 10000;
        pointer-events: none;
    }
    .guideline.vertical {
        width: 1px;
        top: 0;
        bottom: 0;
    }
    .guideline.horizontal {
        height: 1px;
        left: 0;
        right: 0;
    }
    .canvas-paper.drag-over {
        box-shadow: 0 0 0 4px rgba(13, 110, 253, 0.4) !important;
    }
    .btn-xs {
        padding: 0.1rem 0.3rem;
        font-size: 0.75rem;
    }
    .border-dashed {
        border-style: dashed !important;
    }
    :global(.canvas-node) {
        position: relative;
    }
</style>
