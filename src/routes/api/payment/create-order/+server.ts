import { json } from '@sveltejs/kit';
import { createPaymentOrder } from '$lib/server/payment';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals: { supabase, getSession } }) => {
    const session = await getSession();
    if (!session) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { amount, currency = 'INR', description, studentId, applicationId, metadata } = body;

    if (!amount || !studentId) {
        return json({ error: 'Missing required parameters: amount, studentId' }, { status: 400 });
    }

    try {
        const orderResponse = await createPaymentOrder(supabase, {
            amount,
            currency,
            description,
            studentId,
            applicationId,
            metadata
        });

        return json(orderResponse);
    } catch (e: any) {
        console.error('Create Order Error:', e);
        return json({ error: e.message || 'Failed to create order' }, { status: 500 });
    }
};
