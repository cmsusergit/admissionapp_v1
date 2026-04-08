import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { v4 as uuidv4 } from 'uuid';

export const POST: RequestHandler = async ({ request, locals: { supabase, getAuthenticatedUser } }) => {
    const user = await getAuthenticatedUser();
    if (!user) {
        return json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const bucket = 'documents'; // Assuming this bucket is created and policies allow upload

    if (!file) {
        return json({ success: false, message: 'No file provided' }, { status: 400 });
    }

    const fileExtension = file.name.split('.').pop();
    const fileName = `${user.id}/${uuidv4()}.${fileExtension}`;

    const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, file);

    if (error) {
        console.error('Storage upload error for user:', user.id);
        console.error('Target fileName:', fileName);
        console.error('Full error object:', error);
        return json({ success: false, message: error.message }, { status: 500 });
    }

    // Get public URL (optional, depending on bucket privacy)
    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(data.path);

    return json({
        success: true,
        path: data.path,
        url: publicUrlData.publicUrl,
        filename: file.name
    });
};

export const DELETE: RequestHandler = async ({ request, locals: { supabase, getAuthenticatedUser } }) => {
    const user = await getAuthenticatedUser();
    if (!user) {
        return json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { path } = await request.json();

    if (!path) {
        return json({ success: false, message: 'No file path provided' }, { status: 400 });
    }

    // Security check: Ensure user can only delete their own files
    // Path format is usually: "{userId}/{uuid}.{ext}"
    if (!path.startsWith(`${user.id}/`)) {
        return json({ success: false, message: 'Forbidden: You can only delete your own files' }, { status: 403 });
    }

    const { error } = await supabase.storage
        .from('documents')
        .remove([path]);

    if (error) {
        console.error('Storage delete error:', error);
        return json({ success: false, message: error.message }, { status: 500 });
    }

    return json({ success: true, message: 'File deleted successfully' });
};