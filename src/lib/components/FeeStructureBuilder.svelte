<script lang="ts">
    import { createEventDispatcher } from 'svelte';

    export let value: any[] = [];

    const dispatch = createEventDispatcher();

    function addSection() {
        value = [...value, { name: 'New Section', items: [] }];
        update();
    }

    function removeSection(index: number) {
        value = value.filter((_, i) => i !== index);
        update();
    }

    function addItem(sectionIndex: number) {
        value[sectionIndex].items = [...value[sectionIndex].items, { name: 'New Item', amount: 0, allow_partial: false }];
        value = value; // Trigger reactivity
        update();
    }

    function removeItem(sectionIndex: number, itemIndex: number) {
        value[sectionIndex].items = value[sectionIndex].items.filter((_, i) => i !== itemIndex);
        value = value; // Trigger reactivity
        update();
    }

    function update() {
        dispatch('change', value);
        // Calculate total
        const total = value.reduce((sum, section) => {
            return sum + (section.items?.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0) || 0);
        }, 0);
        dispatch('totalChange', total);
    }
</script>

<div class="fee-structure-builder">
    {#each value as section, sIndex}
        <div class="card mb-3">
            <div class="card-header d-flex justify-content-between align-items-center">
                <input 
                    type="text" 
                    class="form-control form-control-sm me-2 fw-bold" 
                    bind:value={section.name} 
                    on:input={update} 
                    placeholder="Section Name"
                    style="max-width: 200px;"
                />
                <button type="button" class="btn btn-sm btn-outline-danger" on:click={() => removeSection(sIndex)}>
                    Remove Section
                </button>
            </div>
            <div class="card-body">
                <table class="table table-sm table-borderless mb-0 align-middle">
                    <thead>
                        <tr>
                            <th>Item Name</th>
                            <th style="width: 150px;">Amount</th>
                            <th style="width: 100px;" class="text-center">Splittable?</th>
                            <th style="width: 50px;"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each section.items as item, iIndex}
                            <tr>
                                <td>
                                    <input 
                                        type="text" 
                                        class="form-control form-control-sm" 
                                        bind:value={item.name} 
                                        on:input={update}
                                        placeholder="Item Name" 
                                    />
                                </td>
                                <td>
                                    <input 
                                        type="number" 
                                        class="form-control form-control-sm" 
                                        bind:value={item.amount} 
                                        on:input={update}
                                        placeholder="0.00" 
                                    />
                                </td>
                                <td class="text-center">
                                    <div class="form-check d-flex justify-content-center">
                                        <input 
                                            class="form-check-input" 
                                            type="checkbox" 
                                            bind:checked={item.allow_partial} 
                                            on:change={update}
                                            title="Allow half payment for this item"
                                        />
                                    </div>
                                </td>
                                <td>
                                    <button type="button" class="btn btn-sm btn-link text-danger p-0" on:click={() => removeItem(sIndex, iIndex)}>
                                        &times;
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
                <button type="button" class="btn btn-sm btn-link text-decoration-none" on:click={() => addItem(sIndex)}>
                    + Add Item
                </button>
            </div>
        </div>
    {/each}

    <button type="button" class="btn btn-sm btn-outline-primary" on:click={addSection}>
        + Add Fee Section
    </button>
</div>