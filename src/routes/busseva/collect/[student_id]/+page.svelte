<script lang="ts">
    import { enhance } from '$app/forms';
    import { toastStore } from '$lib/stores/toastStore';
    
    let { data, form } = $props<{ data: any, form: any }>();
    let loading = $state(false);

    $effect(() => {
        if (form?.message) {
            toastStore.error(form.message);
        }
    });
</script>

<div class="container mt-4" style="max-width: 600px;">
    <h2>Record Bus Seva Fee</h2>
    <a href="/busseva" class="btn btn-sm btn-outline-secondary mb-3">Back to Search</a>

    <div class="card p-4 shadow-sm mb-4">
        <h5>Student Information</h5>
        <div class="row">
            <div class="col-sm-6"><p class="mb-1 text-muted small">Name</p><p class="fw-bold">{data.studentProfile.users?.full_name}</p></div>
            <div class="col-sm-6"><p class="mb-1 text-muted small">Enrollment Number</p><p class="fw-bold">{data.studentProfile.enrollment_number}</p></div>
            <div class="col-sm-6"><p class="mb-1 text-muted small">College</p><p class="fw-bold">{data.activeApp?.courses?.colleges?.name || 'N/A'}</p></div>
            <div class="col-sm-6"><p class="mb-1 text-muted small">Branch</p><p class="fw-bold">{data.activeApp?.branches?.name || 'N/A'}</p></div>
        </div>
    </div>

    <div class="card p-4 shadow-sm">
        <div class="text-center mb-4 bg-light p-3 rounded">
            <h6 class="text-uppercase tracking-wide text-secondary mb-2">Scan QR Code to Pay ({data.activeYear.name})</h6>
            {#if data.qrConfig?.qr_image_url}
                <img src={data.qrConfig.qr_image_url} alt="Payment QR Code" class="img-fluid border rounded" style="max-height: 250px;" />
            {:else}
                <div class="alert alert-warning py-2 mb-0">No payment QR code configured for this year.</div>
            {/if}
        </div>

        <form method="POST" use:enhance={() => { loading = true; return ({ update }) => { loading = false; update(); }; }}>
            <input type="hidden" name="academic_year_id" value={data.activeYear.id} />
            <input type="hidden" name="enrollment_number" value={data.studentProfile.enrollment_number} />
            <input type="hidden" name="college_id" value={data.activeApp?.courses?.college_id} />

            <div class="mb-3">
                <label for="paid_amount" class="form-label font-semibold">Amount Paid (INR)</label>
                <input type="number" name="paid_amount" id="paid_amount" class="form-control" placeholder="e.g. 5000" required min="1" />
            </div>

            <div class="mb-3">
                <label for="transaction_number" class="form-label font-semibold">Transaction ID / Reference Number</label>
                <input type="text" name="transaction_number" id="transaction_number" class="form-control" placeholder="UPI Ref / Bank Txn ID" required />
            </div>

            <button type="submit" class="btn btn-success w-100 py-2 fs-5" disabled={loading}>
                {loading ? 'Recording...' : 'Submit & Print Receipt'}
            </button>
        </form>
    </div>
</div>
