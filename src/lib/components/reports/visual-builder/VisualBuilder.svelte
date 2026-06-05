<script lang="ts">
    import Sidebar from './Sidebar.svelte';
    import CanvasNode from './CanvasNode.svelte';

    // Props using Svelte 5 runes
    let { 
        layout = $bindable([]), 
        htmlContent = $bindable(''), 
        schema = [], 
        selectedTable = '' 
    } = $props();

    // Internal state
    let previewMode = $state(false);
    let selectedId = $state('');
    let rootIsOver = $state(false);
    let zoom = $state(1);

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
        const newNode: any = {
            id: generateId(),
            type,
            children: (type === 'row' || type === 'column') ? [] : undefined,
            style: isRoot ? { 
                position: 'absolute',
                left: '20px',
                top: '20px',
                width: type === 'image' ? '150px' : (type === 'divider' ? '100%' : '200px'),
                height: type === 'image' ? '150px' : 'auto',
                padding: '0px',
                margin: '0px'
            } : {
                width: '100%',
                height: 'auto',
                padding: '5px',
                margin: '0px'
            },
            x: isRoot ? 20 : undefined,
            y: isRoot ? 20 : undefined,
            w: isRoot ? (type === 'image' ? 150 : 200) : undefined,
            h: isRoot ? (type === 'image' ? 150 : 40) : undefined,
            width: type === 'column' ? 6 : undefined
        };

        if (type === 'variable') {
            newNode.variablePath = data.variablePath;
            newNode.variableLabel = data.variableLabel;
        } else if (type === 'text') {
            newNode.content = 'Hello There';
        } else if (type === 'image') {
            newNode.src = '{{college.logo_url}}';
        } else if (type === 'table') {
            newNode.listPath = 'payments';
            newNode.columns = [
                { label: 'Date', path: 'created_at' },
                { label: 'Amount', path: 'amount' },
                { label: 'Status', path: 'status' }
            ];
            newNode.style.width = '100%';
        } else if (type === 'layoutTable') {
            newNode.children = [0, 1].map(() => ({
                id: generateId(),
                type: 'tableRow',
                children: [0, 1].map(() => ({
                    id: generateId(),
                    type: 'tableCell',
                    children: [],
                    style: { padding: '5px', border: '1px dashed #ccc' }
                }))
            }));
            newNode.style.width = '100%';
            newNode.style.borderCollapse = 'collapse';
        }

        if (isRoot) {
            layout = [...layout, newNode];
        } else {
            const newLayout = JSON.parse(JSON.stringify(layout));
            if (findAndAdd(newLayout, targetId, newNode)) {
                layout = newLayout;
            }
        }
        
        selectedId = newNode.id;
        compile();
    }

    function handleRootDragOver(e: DragEvent) {
        e.preventDefault();
        rootIsOver = true;
    }

    function handleRootDrop(e: DragEvent) {
        e.preventDefault();
        rootIsOver = false;
        
        const type = e.dataTransfer?.getData('componentType');
        const variablePath = e.dataTransfer?.getData('variablePath');
        const variableLabel = e.dataTransfer?.getData('variableLabel');
        
        // Calculate drop position relative to canvas
        const canvas = e.currentTarget as HTMLElement;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / zoom;
        const y = (e.clientY - rect.top) / zoom;

        if (type) {
            const newNode: any = {
                id: generateId(),
                type,
                children: (type === 'row' || type === 'column') ? [] : undefined,
                style: { 
                    position: 'absolute',
                    left: `${Math.round(x / 10) * 10}px`,
                    top: `${Math.round(y / 10) * 10}px`,
                    width: type === 'image' ? '150px' : (type === 'divider' ? '100%' : 'auto'),
                    height: type === 'image' ? '150px' : 'auto',
                    padding: '0px',
                    margin: '0px'
                },
                x: Math.round(x / 10) * 10,
                y: Math.round(y / 10) * 10,
                w: type === 'image' ? 150 : 200,
                h: type === 'image' ? 150 : 40
            };
            
            if (type === 'variable') {
                newNode.variablePath = variablePath;
                newNode.variableLabel = variableLabel;
            } else if (type === 'text') {
                newNode.content = 'New Text Block';
            } else if (type === 'image') {
                newNode.src = '{{college.logo_url}}';
            } else if (type === 'table') {
                newNode.listPath = 'payments';
                newNode.columns = [
                    { label: 'Date', path: 'created_at' },
                    { label: 'Amount', path: 'amount' },
                    { label: 'Status', path: 'status' }
                ];
                newNode.style.width = '100%';
            } else if (type === 'layoutTable') {
                newNode.children = [0, 1].map(() => ({
                    id: generateId(),
                    type: 'tableRow',
                    children: [0, 1].map(() => ({
                        id: generateId(),
                        type: 'tableCell',
                        children: [],
                        style: { padding: '5px', border: '1px dashed #ccc' }
                    }))
                }));
                newNode.style.width = '100%';
                newNode.style.borderCollapse = 'collapse';
            }
            
            layout = [...layout, newNode];
            selectedId = newNode.id;
            compile();
        }
    }

    function handleSelect(id: string) {
        const node = findNode(layout, id);
        // Only redirect to parent if we clicked an EMPTY cell or row
        // If it has children, the user probably wants to interact with the children
        if (node && (node.type === 'tableRow' || node.type === 'tableCell') && (!node.children || node.children.length === 0)) {
            const parentTable = findParentTable(layout, id);
            if (parentTable) {
                selectedId = parentTable.id;
                return;
            }
        }
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
                if (node.type === 'layoutTable') {
                    combinedStyle.minWidth = `${node.w}px`;
                    combinedStyle.width = 'fit-content';
                } else {
                    combinedStyle.width = `${node.w}px`;
                }
            }
            if (node.h && node.type !== 'text') {
                if (node.type === 'layoutTable') {
                    combinedStyle.minHeight = `${node.h}px`;
                    combinedStyle.height = 'auto';
                } else {
                    combinedStyle.height = `${node.h}px`;
                }
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

        switch (node.type) {
            case 'row':
                return `<div class="row g-0" style="min-height:20px; ${styleStr}">${node.children.map(compileNode).join('')}</div>`;
            case 'column':
                return `<div class="col-md-${node.width || 12}" style="min-height:10px; ${styleStr}">${node.children.map(compileNode).join('')}</div>`;
            case 'text':
                return `<div style="${styleStr}">${node.content || ''}</div>`;
            case 'variable':
                return `<span style="${styleStr}">{{${node.variablePath}}}</span>`;
            case 'image':
                return `<img src="${node.src || '{{college.logo_url}}'}" style="${styleStr} object-fit:contain;">`;
            case 'table':
                const headers = (node.columns || []).map((c: any) => `<th style="border:1px solid #dee2e6; padding:8px; background-color:#f8f9fa;">${c.label}</th>`).join('');
                const cells = (node.columns || []).map((c: any) => `<td style="border:1px solid #dee2e6; padding:8px;">{{${c.path}}}</td>`).join('');
                return `
                    <table style="width:100%; border-collapse:collapse; ${styleStr}">
                        <thead><tr>${headers}</tr></thead>
                        <tbody>
                            {{#each ${node.listPath}}}
                            <tr>${cells}</tr>
                            {{/each}}
                        </tbody>
                    </table>`;
            case 'layoutTable':
                return `<table style="width:100%; table-layout:fixed; border-collapse:${node.style?.borderCollapse || 'collapse'}; ${styleStr}">${node.children.map(compileNode).join('')}</table>`;
            case 'tableRow':
                return `<tr>${node.children.map(compileNode).join('')}</tr>`;
            case 'tableCell':
                return `<td style="${styleStr}">${node.children.map(compileNode).join('')}</td>`;
            case 'divider':
                return `<hr style="${styleStr}">`;
            default:
                return '';
        }
    }

    function compile() {
        htmlContent = layout.map(compileNode).join('');
    }

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
            // SNAP LOGIC
            // Better: use real mm to px conversion
            const canvasWidth = 210 * 3.7795275591; // mm to px
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
            let snappedX = false;
            for (const tx of targetsX) {
                // Snap Left
                if (Math.abs(newX - tx) < SNAP_THRESHOLD) {
                    newX = tx;
                    guidelines.push({ x: tx });
                    snappedX = true;
                }
                // Snap Center
                else if (Math.abs((newX + currentW / 2) - tx) < SNAP_THRESHOLD) {
                    newX = tx - currentW / 2;
                    guidelines.push({ x: tx });
                    snappedX = true;
                }
                // Snap Right
                else if (Math.abs((newX + currentW) - tx) < SNAP_THRESHOLD) {
                    newX = tx - currentW;
                    guidelines.push({ x: tx });
                    snappedX = true;
                }
            }

            // Check Y snapping
            let snappedY = false;
            for (const ty of targetsY) {
                // Snap Top
                if (Math.abs(newY - ty) < SNAP_THRESHOLD) {
                    newY = ty;
                    guidelines.push({ y: ty });
                    snappedY = true;
                }
                // Snap Middle
                else if (Math.abs((newY + currentH / 2) - ty) < SNAP_THRESHOLD) {
                    newY = ty - currentH / 2;
                    guidelines.push({ y: ty });
                    snappedY = true;
                }
                // Snap Bottom
                else if (Math.abs((newY + currentH) - ty) < SNAP_THRESHOLD) {
                    newY = ty - currentH;
                    guidelines.push({ y: ty });
                    snappedY = true;
                }
            }

            // Grid fallback if not snapped
            newX = Math.round(newX);
            newY = Math.round(newY);

            updateSelectedNode({ x: newX, y: newY });

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
            const canvasWidth = 210 * 3.7795275591;
            const canvasHeight = 297 * 3.7795275591;
            const targetsX = [0, canvasWidth / 2, canvasWidth];
            const targetsY = [0, canvasHeight / 2, canvasHeight];

            layout.forEach(n => {
                if (n.id === dragState.activeId || n.x === undefined) return;
                targetsX.push(n.x, n.x + (n.w || 0), n.x + (n.w || 0) / 2);
                targetsY.push(n.y, n.y + (n.h || 0), n.y + (n.h || 0) / 2);
            });

            // Snap edges based on direction
            if (dir.includes('e')) {
                for (const tx of targetsX) {
                    if (Math.abs((finalX + finalW) - tx) < SNAP_THRESHOLD) {
                        finalW = tx - finalX;
                        guidelines.push({ x: tx });
                        break;
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
                        break;
                    }
                }
            }
            if (dir.includes('s')) {
                for (const ty of targetsY) {
                    if (Math.abs((finalY + finalH) - ty) < SNAP_THRESHOLD) {
                        finalH = ty - finalY;
                        guidelines.push({ y: ty });
                        break;
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
                        break;
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
            <span class="badge bg-primary text-white">Visual Mode</span>
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
            <div class="d-flex align-items-center ms-3">
                <i class="bi bi-zoom-out text-light me-2 x-small"></i>
                <input type="range" class="form-range" min="0.5" max="1.5" step="0.1" bind:value={zoom} oninput={(e) => e.stopPropagation()} style="width: 100px;">
                <i class="bi bi-zoom-in text-light ms-2 x-small"></i>
                <span class="text-light ms-2 x-small">{Math.round(zoom * 100)}%</span>
            </div>
        </div>
        <div class="btn-group btn-group-sm">
            <button type="button" class="btn btn-outline-light" class:active={!previewMode} onclick={() => previewMode = false}>Design</button>
            <button type="button" class="btn btn-outline-light" class:active={previewMode} onclick={() => previewMode = true}>Preview</button>
        </div>
    </div>

    <div class="builder-body position-relative">
        <!-- Sidebar Drawer -->
        <div class="sidebar-drawer border-end bg-light">
            <div class="drawer-handle d-flex align-items-center justify-content-center text-muted">
                <i class="bi {selectedId ? 'bi-gear-fill text-primary' : 'bi-chevron-right'}"></i>
            </div>
            <div class="drawer-content p-3">
                <Sidebar 
                    {schema} 
                    {selectedTable} 
                    {layout}
                    selectedNode={selectedNode} 
                    onUpdateNode={updateSelectedNode}
                    onInsertVariable={(detail: any) => onDrop('root', 'variable', detail)}
                />
            </div>
        </div>

        <!-- Main Workspace -->
        <div class="workspace-viewport" style="height: 800px; width: 100%;">
            {#if previewMode}
                <div class="canvas-paper shadow p-5" style="overflow-x: hidden; min-height: 297mm; position: relative;">
                    {@html htmlContent}
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
    .sidebar-drawer:hover, .sidebar-drawer.active {
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
