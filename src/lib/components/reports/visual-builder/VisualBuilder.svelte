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
                if (node.type === 'row' || node.type === 'column') {
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
            newNode.content = 'New Text Block';
        } else if (type === 'image') {
            newNode.src = '{{college.logo_url}}';
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
            }
            
            layout = [...layout, newNode];
            selectedId = newNode.id;
            compile();
        }
    }

    function handleSelect(id: string) {
        selectedId = id;
    }

    function compileNode(node: any): string {
        let styleStr = '';
        const combinedStyle = { ...node.style };
        
        // Use absolute positioning for top-level, relative for nested
        if (node.x !== undefined && node.y !== undefined) {
            combinedStyle.position = 'absolute';
            combinedStyle.left = `${node.x}px`;
            combinedStyle.top = `${node.y}px`;
            if (node.w) combinedStyle.width = `${node.w}px`;
            if (node.h && node.type !== 'text') combinedStyle.height = `${node.h}px`;
        } else {
            // Nested elements
            combinedStyle.position = 'relative';
            combinedStyle.width = combinedStyle.width || '100%';
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
                return `<div style="text-align:center; ${styleStr}"><img src="${node.src || '{{college.logo_url}}'}" style="width:100%; height:100%; object-fit:contain;"></div>`;
            case 'divider':
                return `<hr style="${styleStr}">`;
            default:
                return '';
        }
    }

    function compile() {
        htmlContent = layout.map(compileNode).join('');
    }

    function deleteNode() {
        if (!selectedId) return;
        
        function filterNodes(nodes: any[]) {
            return nodes.filter(n => {
                if (n.id === selectedId) return false;
                if (n.children) n.children = filterNodes(n.children);
                return true;
            });
        }
        
        layout = filterNodes(JSON.parse(JSON.stringify(layout)));
        selectedId = '';
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
            const snapPointsX = [0, 210 * 3.78 / 2, 210 * 3.78]; // Left, Center, Right of A4 (approx px)
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
            if (!snappedX) newX = Math.round(newX / 5) * 5;
            if (!snappedY) newY = Math.round(newY / 5) * 5;

            updateSelectedNode({ x: newX, y: newY });

        } else if (dragState.type === 'resize') {
            const dir = dragState.resizeDir;
            let finalX = dragState.initialX;
            let finalY = dragState.initialY;
            let finalW = dragState.initialW;
            let finalH = dragState.initialH;

            if (dir.includes('e')) finalW = Math.max(20, dragState.initialW + dx);
            if (dir.includes('s')) finalH = Math.max(20, dragState.initialH + dy);
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

            updateSelectedNode({
                x: Math.round(finalX / 5) * 5,
                y: Math.round(finalY / 5) * 5,
                w: Math.round(finalW / 5) * 5,
                h: Math.round(finalH / 5) * 5
            });
        }
    }

    function updateSelectedNode(updates: any) {
        if (!selectedId) return;
        
        if (updates.delete) {
            deleteNode();
            return;
        }

        if (updates.duplicate) {
            const nodeToDuplicate = findNode(layout, selectedId);
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
                if (n.id === selectedId) {
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
                    selectedNode={selectedNode} 
                    onUpdateNode={updateSelectedNode}
                    onInsertVariable={(detail: any) => onDrop('root', 'variable', detail)}
                />
            </div>
        </div>

        <!-- Main Workspace -->
        <div class="workspace-viewport" style="height: 800px; width: 100%;">
            {#if previewMode}
                <div class="canvas-paper shadow p-5" style="overflow-x: hidden; height: 297mm; position: relative;">
                    {@html htmlContent}
                    <div class="page-boundary-indicator"></div>
                    <div class="page-boundary-label">End of A4 Page (297mm)</div>
                </div>
            {:else}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                    class="canvas-paper shadow" 
                    class:drag-over={rootIsOver}
                    style:transform="scale({zoom})"
                    style:transform-origin="top center"
                    style:height="297mm"
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
                                />
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
                    <div class="page-boundary-indicator"></div>
                    <div class="page-boundary-label">End of A4 Page (297mm)</div>
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
        /* Fixed A4 height */
        height: 297mm; 
        box-shadow: 0 0 20px rgba(0,0,0,0.15);
        position: relative;
        transition: transform 0.2s ease;
        /* Grid Pattern */
        background-image: radial-gradient(#d1d1d1 1px, transparent 1px);
        background-size: 20px 20px;
        overflow: hidden; /* Enforce single page */
        padding: 0 !important;
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
