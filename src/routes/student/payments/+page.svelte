<script lang="ts">
    import type { PageData, ActionData } from './$types';
    import { page } from '$app/stores';
    import PaymentButton from '$lib/components/PaymentButton.svelte';

    export let data: PageData;
    export let form: ActionData;

    // Helper to get fee structure for a given application
    $: getFeeStructure = (appId: string) => {
        if (!data.feeStructures) return null;
        const fsEntry = data.feeStructures.find(fs => fs && fs.applicationId === appId);
        return fsEntry?.feeStructure || null;
    };

    // Helper to calculate paid amount for an application (Tuition Only)
    $: getTuitionPaidAmount = (appId: string) => {
        if (!data.payments) return 0;
        return data.payments
            .filter(p => p.application_id === appId && p.status === 'completed' && p.payment_type === 'tuition_fee')
            .reduce((sum, p) => sum + p.amount, 0);
    };

    // Helper to calculate outstanding balance for tuition
    $: getOutstandingTuition = (appId: string) => {
        const feeStructure = getFeeStructure(appId);
        if (!feeStructure) return null;
        const totalFee = feeStructure.total_fee;
        const paid = getTuitionPaidAmount(appId);
        return totalFee - paid;
    };
</script>

<div class="container-fluid">
    <h1 class="mb-4">My Payments</h1>

    {#if form?.message}
        <div class="alert {form.error ? 'alert-danger' : 'alert-success'} alert-dismissible fade show" role="alert">
            {form.message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    {/if}

    <!-- Application Fees Section -->
    <div class="card mb-4">
        <div class="card-header">
            <h4>Application Fees</h4>
        </div>
        <div class="card-body">
            {#if data.applicationsWithFees.length > 0}
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Course</th>
                                <th>Academic Year</th>
                                <th>Fee Amount</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.applicationsWithFees as app}
                                {@const appAny = app as any}
                                <tr>
                                    <td>{appAny.courses?.name}</td>
                                    <td>{appAny.admission_cycles?.academic_years?.name}</td>
                                    <td>{appAny.form_fee}</td>
                                    <td>
                                        <span class="badge {appAny.application_fee_status === 'paid' ? 'bg-success' : 'bg-warning text-dark'}">
                                            {appAny.application_fee_status === 'not_applicable' ? 'Pending' : appAny.application_fee_status}
                                        </span>
                                    </td>
                                    <td>
                                        {#if appAny.application_fee_status === 'paid'}
                                            <span class="badge bg-success">Paid</span>
                                        {:else if appAny.form_fee > 0}
                                            <PaymentButton 
                                                applicationId={appAny.id} 
                                                studentId={$page.data.session?.user?.id || ''} 
                                                amount={appAny.form_fee} 
                                                paymentType="application_fee" 
                                                buttonText="Pay Fee" 
                                                buttonClass="btn btn-sm btn-primary" 
                                            />
                                        {:else}
                                            <span class="text-muted small" title="Fee amount not set">Contact Admin</span>
                                        {/if}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}
                <p>No pending application fees.</p>
            {/if}
        </div>
    </div>

    <!-- Provisional Fees Section -->
    <div class="card mb-4">
        <div class="card-header">
            <h4>Provisional Fees</h4>
        </div>
        <div class="card-body">
            {#if data.provisionalFeeApps && data.provisionalFeeApps.length > 0}
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Admission No.</th>
                                <th>Course</th>
                                <th>Academic Year</th>
                                <th>Fee Amount</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.provisionalFeeApps as app}
                                {@const appAny = app as any}
                                <tr>
                                    <td>{appAny.account_admissions?.[0]?.admission_number || 'N/A'}</td>
                                    <td>{appAny.courses?.name}</td>
                                    <td>{appAny.admission_cycles?.academic_years?.name}</td>
                                    <td>{appAny.prov_fee || 'N/A'}</td>
                                    <td>
                                        {#if appAny.prov_fee > 0}
                                            <PaymentButton 
                                                applicationId={appAny.id} 
                                                studentId={$page.data.session?.user?.id || ''} 
                                                amount={appAny.prov_fee} 
                                                paymentType="provisional_fee" 
                                                buttonText="Pay Provisional Fee" 
                                                buttonClass="btn btn-sm btn-info" 
                                            />
                                        {:else}
                                            <span class="text-muted small">No Fee Required</span>
                                        {/if}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}
                <p>No pending provisional fees.</p>
            {/if}
        </div>
    </div>

    <!-- Tuition Fees Section -->
    <div class="card mb-4">
        <div class="card-header">
            <h4>Tuition Fees</h4>
        </div>
        <div class="card-body">
            {#if data.tuitionFeeApps.length > 0}
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Admission No.</th>
                                <th>Course</th>
                                <th>Academic Year</th>
                                <th>Total Fee</th>
                                <th>Paid</th>
                                <th>Outstanding</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.tuitionFeeApps as app}
                                {@const appAny = app as any}
                                {@const feeStructure = getFeeStructure(appAny.id)}
                                {@const paidAmount = getTuitionPaidAmount(appAny.id)}
                                {@const outstanding = getOutstandingTuition(appAny.id)}
                                <tr>
                                    <td>{appAny.account_admissions?.[0]?.admission_number || 'N/A'}</td>
                                    <td>{appAny.courses?.name}</td>
                                    <td>{appAny.admission_cycles?.academic_years?.name}</td>
                                    <td>{feeStructure?.total_fee || 'N/A'}</td>
                                    <td>{paidAmount}</td>
                                    <td>{outstanding !== null ? outstanding : 'N/A'}</td>
                                    <td>
                                        {#if outstanding && outstanding > 0}
                                            <PaymentButton 
                                                applicationId={appAny.id} 
                                                studentId={$page.data.session?.user?.id || ''} 
                                                amount={outstanding} 
                                                paymentType="tuition_fee" 
                                                buttonText="Pay Tuition" 
                                                buttonClass="btn btn-sm btn-success" 
                                            />
                                        {:else if outstanding !== null}
                                            <span class="badge bg-success">Paid</span>
                                        {/if}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}
                <p>No approved applications requiring tuition payment at this time.</p>
            {/if}
        </div>
    </div>

    <!-- Payment History -->
    <div class="card">
        <div class="card-header">
            <h4>Payment History</h4>
        </div>
        <div class="card-body">
            {#if data.payments.length > 0}
                <div class="table-responsive">
                    <table class="table table-striped table-hover">
                        <thead>
                            <tr>
                                <th>Application ID</th>
                                <th>Payment Type</th>
                                <th>Amount</th>
                                <th>Transaction ID</th>
                                <th>Status</th>
                                <th>Date</th>
                                <th>Receipt</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each data.payments as payment}
                                <tr>
                                    <td title={payment.application_id}>{payment.application_id.substring(0, 8)}...</td>
                                    <td>
                                        <span class="badge {payment.payment_type === 'application_fee' ? 'bg-info text-dark' : payment.payment_type === 'provisional_fee' ? 'bg-warning text-dark' : 'bg-primary'}">
                                            {payment.payment_type === 'application_fee' ? 'App Fee' : payment.payment_type === 'provisional_fee' ? 'Prov. Fee' : 'Tuition'}
                                        </span>
                                    </td>
                                    <td>{payment.amount}</td>
                                    <td>{payment.transaction_id}</td>
                                    <td><span class="badge {payment.status === 'completed' ? 'bg-success' : 'bg-danger'}">{payment.status}</span></td>
                                    <td>{new Date(payment.payment_date).toLocaleDateString()}</td>
                                    <td>
                                        {#if payment.status === 'completed'}
                                            <a href="/receipts/print?payment_id={payment.id}" target="_blank" class="btn btn-sm btn-outline-secondary">
                                                <i class="bi bi-printer"></i> Print
                                            </a>
                                        {:else}
                                            <span class="text-muted">-</span>
                                        {/if}
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {:else}
                <p>No payment history found.</p>
            {/if}
        </div>
    </div>
</div>
