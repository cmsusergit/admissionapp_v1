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
        const newNode: any = {
            id: generateId(),
            type,
            children: (type === 'row' || type === 'column') ? [] : undefined,
            style: { padding: '5px', margin: '0' },
            width: type === 'column' ? 6 : undefined
        };

        if (type === 'variable') {
            newNode.variablePath = data.variablePath;
            newNode.variableLabel = data.variableLabel;
        } else if (type === 'text') {
            newNode.content = 'New Text Block';
        }

        if (targetId === 'root') {
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
        if (type) {
            onDrop('root', type, { variablePath, variableLabel });
        }
    }

    function handleSelect(id: string) {
        selectedId = id;
    }

    function compileNode(node: any): string {
        let styleStr = '';
        if (node.style) {
            Object.entries(node.style).forEach(([k, v]) => {
                const cssKey = k.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
                styleStr += `${cssKey}:${v};`;
            });
        }

        switch (node.type) {
            case 'row':
                return `<div class="row" style="position:relative; ${styleStr}">${node.children.map(compileNode).join('')}</div>`;
            case 'column':
                return `<div class="col-md-${node.width || 12}" style="position:relative; ${styleStr}">${node.children.map(compileNode).join('')}</div>`;
            case 'text':
                return `<div style="position:relative; ${styleStr}">${node.content || ''}</div>`;
            case 'variable':
                return `<span style="position:relative; ${styleStr}">{{${node.variablePath}}}</span>`;
            case 'image':
                return `<div style="text-align:center; position:relative; ${styleStr}"><img src="${node.src || '{{college.logo_url}}'}" style="max-width:100%; height:auto;"></div>`;
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

    <div class="row g-0">
        <div class="col-md-3 border-end bg-light p-3" style="height: 800px; overflow-y: auto;">
            <Sidebar 
                {schema} 
                {selectedTable} 
                selectedNode={selectedNode} 
                onUpdateNode={updateSelectedNode}
                onInsertVariable={(detail: any) => onDrop('root', 'variable', detail)}
            />
        </div>

        <div class="col-md-9 workspace-viewport" style="height: 800px;">
            {#if previewMode}
                <div class="canvas-paper shadow p-5" style="overflow-x: hidden;">
                    {@html htmlContent}
                </div>
            {:else}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                    class="canvas-paper shadow p-4" 
                    class:drag-over={rootIsOver}
                    style:transform="scale({zoom})"
                    style:transform-origin="top center"
                    ondragover={handleRootDragOver}
                    ondragleave={() => rootIsOver = false}
                    ondrop={handleRootDrop}
                >
                    {#if layout.length === 0}
                        <div class="text-center text-muted mt-5 py-5 border-dashed border-2 rounded">
                            <i class="bi bi-plus-circle display-4"></i>
                            <p class="mt-2">Drag components from the sidebar to start designing.</p>
                        </div>
                    {:else}
                        {#each layout as node (node.id)}
                            <CanvasNode {node} onSelect={handleSelect} {onDrop} {selectedId} />
                        {/each}
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
        /* Grid Pattern */
        background-image: radial-gradient(#d1d1d1 1px, transparent 1px);
        background-size: 20px 20px;
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
