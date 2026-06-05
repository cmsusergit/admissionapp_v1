<script lang="ts">
    let { 
        node = $bindable(), 
        onSelect = () => {},
        onDrop = () => {},
        selectedId = '',
        zoom = 1,
        onUpdateNode = () => {},
        onStartAction = (id: string, type: 'move' | 'resize', e: MouseEvent, dir?: string) => {},
        isDragging = false
    } = $props();

    let isOver = $state(false);

    // Determine the HTML tag based on node type
    let tag = $derived(
        node.type === 'tableRow' ? 'tr' : 
        node.type === 'tableCell' ? 'td' : 
        'div'
    );

    function handleMouseDown(e: MouseEvent) {
        const target = e.target as HTMLElement;
        
        // If it's a resize handle, handle it and stop everything
        if (target.classList.contains('resize-handle')) {
            onSelect(node.id);
            onStartAction(node.id, 'resize', e, target.dataset.dir);
            e.stopPropagation();
            return;
        }

        // Handle selection: Deepest component wins
        if (!(e as any)._selectionHandled) {
            onSelect(node.id);
            (e as any)._selectionHandled = true;
        }

        // Handle movement: Nearest movable ancestor wins
        if (node.x !== undefined) {
            onStartAction(node.id, 'move', e);
            e.stopPropagation();
        }
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        isOver = true;
        if (e.dataTransfer) {
            e.dataTransfer.dropEffect = 'move';
        }
    }

    function handleDragLeave() {
        isOver = false;
    }

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        isOver = false;
        
        const type = e.dataTransfer?.getData('componentType');
        const variablePath = e.dataTransfer?.getData('variablePath');
        const variableLabel = e.dataTransfer?.getData('variableLabel');
        
        if (type) {
            onDrop(node.id, type, { variablePath, variableLabel });
        }
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svelte:element
    this={tag}
    class="node-{node.type} {node.x !== undefined ? 'canvas-node' : ''}" 
    class:selected={selectedId === node.id}
    class:drag-over={isOver}
    class:is-dragging={isDragging}
    onmousedown={handleMouseDown}
    onclick={(e) => e.stopPropagation()}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    style:left={node.x !== undefined ? `${node.x}px` : undefined}
    style:top={node.y !== undefined ? `${node.y}px` : undefined}
    style:width={node.w !== undefined ? (node.type === 'layoutTable' ? 'fit-content' : `${node.w}px`) : (node.style?.width || (node.type === 'tableCell' ? undefined : '100%'))}
    style:min-width={node.type === 'layoutTable' && node.w !== undefined ? `${node.w}px` : undefined}
    style:height={node.type === 'text' || node.type === 'layoutTable' ? 'auto' : (node.h !== undefined ? `${node.h}px` : (node.style?.height || 'auto'))}
    style:min-height={node.type === 'layoutTable' && node.h !== undefined ? `${node.h}px` : undefined}
    style:padding={node.style?.padding || (node.type === 'tableCell' ? '5px' : '0px')}
    style:margin={node.style?.margin || '0'}
    style:border={node.style?.border || (node.type === 'tableCell' ? '1px dashed #eee' : (selectedId === node.id ? '1px solid #0d6efd' : (node.type === 'row' || node.type === 'column' ? '1px dashed #ccc' : 'none')))}
    style:text-align={node.style?.textAlign || 'left'}
    style:color={node.style?.color}
    style:background-color={isOver ? 'rgba(13, 110, 253, 0.05)' : (node.style?.backgroundColor || 'transparent')}
    style:font-size={node.style?.fontSize}
    style:font-weight={node.style?.fontWeight}
    style:z-index={node.style?.zIndex || 'auto'}
    style:position={node.x !== undefined ? 'absolute' : (tag === 'div' ? 'relative' : undefined)}
    style:border-collapse={node.type === 'layoutTable' ? (node.style?.borderCollapse || 'collapse') : undefined}
    style:outline={tag === 'td' && selectedId === node.id ? '2px solid #0d6efd' : undefined}
    style:outline-offset={tag === 'td' ? '-2px' : undefined}
>
    {#if tag === 'div' && node.type !== 'layoutTable'}
        <div class="node-label">{node.type}</div>
    {/if}
    
    {#if selectedId === node.id && node.x !== undefined}
        <div class="resize-handle nw" data-dir="nw"></div>
        <div class="resize-handle ne" data-dir="ne"></div>
        <div class="resize-handle sw" data-dir="sw"></div>
        <div class="resize-handle se" data-dir="se"></div>
        <div class="resize-handle n" data-dir="n"></div>
        <div class="resize-handle s" data-dir="s"></div>
        <div class="resize-handle e" data-dir="e"></div>
        <div class="resize-handle w" data-dir="w"></div>
    {/if}

    {#if node.type === 'row'}
        <div class="row g-0" style:min-height="40px" style:width="100%">
            {#if node.children.length === 0}
                <div class="col-12 text-center text-muted small py-2 border-dashed border-1">Empty Row</div>
            {:else}
                {#each node.children as child (child.id)}
                    <div class="col-{child.width || 12}">
                        <svelte:self node={child} {onSelect} {onDrop} {selectedId} {zoom} {onUpdateNode} {onStartAction} isDragging={selectedId === child.id && isDragging}></svelte:self>
                    </div>
                {/each}
            {/if}
        </div>
    {:else if node.type === 'column'}
        <div class="column-content d-flex flex-column" style:min-height="30px" style:width="100%">
            {#if node.children.length === 0}
                <div class="text-center text-muted x-small py-1 border-dashed border-1">Empty Column</div>
            {:else}
                {#each node.children as child (child.id)}
                    <div style:width="100%">
                        <svelte:self node={child} {onSelect} {onDrop} {selectedId} {zoom} {onUpdateNode} {onStartAction} isDragging={selectedId === child.id && isDragging}></svelte:self>
                    </div>
                {/each}
            {/if}
        </div>
    {:else if node.type === 'layoutTable'}
        <table style="width:100%; height: 100%; border-collapse: inherit; table-layout: fixed; border: none;">
            <tbody>
                {#each node.children as row (row.id)}
                    <svelte:self node={row} {onSelect} {onDrop} {selectedId} {zoom} {onUpdateNode} {onStartAction} {isDragging}></svelte:self>
                {/each}
            </tbody>
        </table>
    {:else if node.type === 'tableRow'}
        {#each node.children as cell (cell.id)}
            <svelte:self node={cell} {onSelect} {onDrop} {selectedId} {zoom} {onUpdateNode} {onStartAction} {isDragging}></svelte:self>
        {/each}
    {:else if node.type === 'tableCell'}
        {#if node.children.length === 0}
            <div class="text-center text-muted xx-small py-2 border-dashed" style="pointer-events: none; min-height: 20px;">Cell</div>
        {:else}
            {#each node.children as child (child.id)}
                <div style:width="100%" style="pointer-events: auto;">
                    <svelte:self node={child} {onSelect} {onDrop} {selectedId} {zoom} {onUpdateNode} {onStartAction} isDragging={selectedId === child.id && isDragging}></svelte:self>
                </div>
            {/each}
        {/if}
    {:else if node.type === 'text'}
        <div style="white-space: pre-wrap; min-height: 1.2em; pointer-events: none;">{node.content || 'Hello There'}</div>
    {:else if node.type === 'variable'}
        <div class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 p-2 d-block text-start" style="pointer-events: none;">
            <i class="bi bi-braces me-1"></i> {node.variableLabel || node.variablePath || 'Variable'}
            <div class="x-small text-muted font-monospace mt-1">&#123;&#123;{node.variablePath}&#125;&#125;</div>
        </div>
    {:else if node.type === 'image'}
        <div class="text-center p-0 border-0 bg-light overflow-hidden h-100" style="pointer-events: none;">
            {#if node.src && !node.src.includes('{{')}
                <img src={node.src} alt="Preview" style="width: 100%; height: 100%; object-fit: contain;">
            {:else}
                <div class="d-flex flex-column align-items-center justify-content-center h-100">
                    <i class="bi bi-image fs-4 text-muted"></i>
                    <div class="xx-small text-muted mt-1 text-truncate px-2" style="max-width: 100%">
                        {node.src || 'Image Placeholder'}
                    </div>
                </div>
            {/if}
        </div>
    {:else if node.type === 'table'}
        <div class="table-responsive" style="pointer-events: none;">
            <table class="table table-bordered table-sm mb-0 bg-white" style="font-size: 0.75rem;">
                <thead class="table-light">
                    <tr>
                        {#each (node.columns || []) as col}
                            <th>{col.label}</th>
                        {/each}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        {#each (node.columns || []) as col}
                            <td class="text-muted font-monospace xx-small">&#123;&#123;{col.path}&#125;&#125;</td>
                        {/each}
                    </tr>
                </tbody>
            </table>
            <div class="xx-small text-primary mt-1 fw-bold">
                <i class="bi bi-repeat"></i> Repeated for each in <u>{node.listPath}</u>
            </div>
        </div>
    {:else if node.type === 'divider'}
        <hr class="my-1" style="pointer-events: none; width: 100%;">
    {/if}
</svelte:element>

<style>
    .canvas-node {
        transition: outline 0.15s ease;
        cursor: move;
        min-height: 10px;
        box-sizing: border-box;
        user-select: none;
    }
    .is-dragging {
        opacity: 0.8;
        z-index: 9999 !important;
    }
    .canvas-node:hover {
        outline: 1px dashed #0d6efd !important;
    }
    .canvas-node.selected {
        outline: 1px solid #0d6efd !important;
        z-index: 10;
    }
    .drag-over {
        background-color: rgba(13, 110, 253, 0.08) !important;
        outline: 2px solid #0d6efd !important;
    }
    .node-label {
        position: absolute;
        top: -18px;
        left: -1px;
        background: #0d6efd;
        color: white;
        font-size: 10px;
        padding: 0 4px;
        border-radius: 2px 2px 0 0;
        display: none;
        white-space: nowrap;
        pointer-events: none;
    }
    .selected > .node-label {
        display: block;
    }
    .x-small {
        font-size: 0.7rem;
    }
    .xx-small {
        font-size: 0.6rem;
    }

    /* Resize Handles */
    .resize-handle {
        position: absolute;
        width: 10px;
        height: 10px;
        background: white;
        border: 1px solid #0d6efd;
        z-index: 1000;
        box-shadow: 0 0 20px rgba(0,0,0,0.2);
    }
    .nw { top: -5px; left: -5px; cursor: nw-resize; }
    .ne { top: -5px; right: -5px; cursor: ne-resize; }
    .sw { bottom: -5px; left: -5px; cursor: sw-resize; }
    .se { bottom: -5px; right: -5px; cursor: se-resize; }
    .n { top: -5px; left: 50%; transform: translateX(-50%); cursor: n-resize; }
    .s { bottom: -5px; left: 50%; transform: translateX(-50%); cursor: s-resize; }
    .e { right: -5px; top: 50%; transform: translateY(-50%); cursor: e-resize; }
    .w { left: -5px; top: 50%; transform: translateY(-50%); cursor: w-resize; }

    /* Layout Table specific fixes */
    .node-tableRow { display: table-row; }
    .node-tableCell { display: table-cell; vertical-align: top; }
</style>
