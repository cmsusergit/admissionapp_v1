<script lang="ts">
    let { 
        node = $bindable(), 
        onSelect = () => {},
        onDrop = () => {},
        selectedId = ''
    } = $props();

    let isOver = $state(false);

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

    function handleClick(e: MouseEvent) {
        e.stopPropagation();
        onSelect(node.id);
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
    class="canvas-node {node.type}" 
    class:selected={selectedId === node.id}
    class:drag-over={isOver}
    onclick={handleClick}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    style:padding={node.style?.padding || '5px'}
    style:margin={node.style?.margin || '0'}
    style:border={node.style?.border || '1px dashed #ccc'}
    style:text-align={node.style?.textAlign || 'left'}
    style:color={node.style?.color}
    style:background-color={node.style?.backgroundColor}
    style:font-size={node.style?.fontSize}
    style:font-weight={node.style?.fontWeight}
    style:z-index={node.style?.zIndex || 'auto'}
>
    <div class="node-label">{node.type}</div>
    {#if node.type === 'row'}
        <div class="row g-2" style:min-height="40px">
            {#if node.children.length === 0}
                <div class="col-12 text-center text-muted small py-2">Empty Row</div>
            {:else}
                {#each node.children as child (child.id)}
                    <div class="col-{child.width || 12}">
                        <svelte:self node={child} {onSelect} {onDrop} {selectedId}></svelte:self>
                    </div>
                {/each}
            {/if}
        </div>
    {:else if node.type === 'column'}
        <div class="column-content" style:min-height="30px">
            {#if node.children.length === 0}
                <div class="text-center text-muted x-small py-1">Empty Column</div>
            {:else}
                {#each node.children as child (child.id)}
                    <svelte:self node={child} {onSelect} {onDrop} {selectedId}></svelte:self>
                {/each}
            {/if}
        </div>
    {:else if node.type === 'text'}
        <div>{node.content || 'Text Block'}</div>
    {:else if node.type === 'variable'}
        <div class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 p-2 d-block text-start">
            <i class="bi bi-braces me-1"></i> {node.variableLabel || node.variablePath || 'Variable'}
            <div class="x-small text-muted font-monospace mt-1">{"{{"}{node.variablePath}{"}}"}</div>
        </div>
    {:else if node.type === 'image'}
        <div class="text-center p-2 border rounded bg-light">
            <i class="bi bi-image fs-2 text-muted"></i>
            <div class="x-small text-muted mt-1">{node.src || 'Image Placeholder'}</div>
        </div>
    {:else if node.type === 'divider'}
        <hr class="my-1">
    {/if}
</div>

<style>
    .canvas-node {
        position: relative;
        transition: all 0.15s ease;
        cursor: pointer;
        min-height: 20px;
    }
    .canvas-node:hover {
        outline: 1px dashed #0d6efd !important;
        outline-offset: -1px;
    }
    .canvas-node.selected {
        outline: 2px solid #0d6efd !important;
        outline-offset: -2px;
        box-shadow: 0 0 10px rgba(13, 110, 253, 0.2);
        z-index: 10;
    }
    .drag-over {
        background-color: rgba(13, 110, 253, 0.08);
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
    .canvas-node.selected > .node-label {
        display: block;
    }
    .x-small {
        font-size: 0.7rem;
    }
</style>
