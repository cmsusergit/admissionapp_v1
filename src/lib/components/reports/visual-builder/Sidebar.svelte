<script lang="ts">
    import SchemaTree from '$lib/components/SchemaTree.svelte';

    let { 
        schema = [], 
        selectedTable = '',
        selectedNode = null,
        onUpdateNode = () => {},
        onInsertVariable = (detail: any) => {}
    } = $props();

    const components = [
        { type: 'row', label: 'Row', icon: 'bi-grid-1x2', description: 'Horizontal container' },
        { type: 'column', label: 'Column', icon: 'bi-layout-sidebar', description: 'Vertical container' },
        { type: 'text', label: 'Text', icon: 'bi-type', description: 'Paragraph or Label' },
        { type: 'variable', label: 'Variable', icon: 'bi-braces', description: 'Database field' },
        { type: 'image', label: 'Image', icon: 'bi-image', description: 'Logo or Photo' },
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

    function handleInsertVariable(event: CustomEvent) {
        event.stopPropagation();
        onInsertVariable(event.detail);
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

            <h6 class="small fw-bold mb-2">Variables</h6>
            <p class="x-small text-muted mb-2">Drag fields onto the canvas.</p>
            
            {#if selectedTable}
                <div class="border rounded p-2 bg-white" style="max-height: 400px; overflow-y: auto;">
                    <SchemaTree 
                        tableName={selectedTable} 
                        schema={schema} 
                        insertMode={true}
                        on:insert={handleInsertVariable}
                    />
                </div>
            {:else}
                <div class="alert alert-warning x-small">Select a Base Table to see variables.</div>
            {/if}
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
                    
                    <!-- Content Group -->
                    {#if selectedNode.type === 'text' || selectedNode.type === 'variable'}
                        <div class="prop-group mb-3">
                            <label class="x-small fw-bold text-muted text-uppercase d-block mb-1">Content</label>
                            {#if selectedNode.type === 'text'}
                                <textarea class="form-control form-control-sm" rows="3" value={selectedNode.content} onchange={(e) => onUpdateNode({ content: e.currentTarget.value })}></textarea>
                            {:else}
                                <div class="p-2 border rounded bg-white x-small font-monospace">
                                    {"{{"}{selectedNode.variablePath}{"}}"}
                                </div>
                            {/if}
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
