import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals: { supabase, getAuthenticatedUser, userProfile }, url }) => {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
        throw redirect(303, '/login');
    }

    if (userProfile?.role !== 'student') {
        throw redirect(303, '/login'); // Redirect non-student users
    }

    // Fetch student's applications to link documents to
    const { data: applicationsRaw, error: appError } = await supabase
        .from('applications')
        .select('id, form_type, branch_id, status, courses!left(name), admission_cycles!left(name, academic_years(name))')
        .eq('student_id', userProfile.id)
        .order('updated_at', { ascending: false });

    if (appError) {
        console.error('Error fetching student applications for documents:', appError.message);
        return { applications: [], documents: [] };
    }

    // Manual join for branches
    let applications = applicationsRaw || [];
    const branchIds = [...new Set(applications.map(app => app.branch_id).filter(Boolean))];
    
    if (branchIds.length > 0) {
        const { data: branchesData } = await supabase
            .from('branches')
            .select('id, name')
            .in('id', branchIds);
            
        const branchMap = new Map(branchesData?.map(b => [b.id, b]) || []);
        
        applications = applications.map(app => ({
            ...app,
            branches: app.branch_id ? branchMap.get(app.branch_id) : null
        }));
    } else {
        applications = applications.map(app => ({ ...app, branches: null }));
    }

    const applicationId = url.searchParams.get('applicationId');
    let documents = [];

    console.log('Debug: applicationId from URL:', applicationId);

    // Fetch documents only for the selected application
    if (applicationId) {
        const { data: docs, error: docsError } = await supabase
            .from('documents')
            .select('id, application_id, document_type, file_name, file_path, status, rejection_reason, created_at, updated_at')
            .eq('application_id', applicationId);
            
        if (docsError) {
             console.error('Error fetching documents:', docsError.message);
        } else {
            console.log('Debug: Documents found:', docs?.length);
            documents = docs || [];

            // --- Self-Healing: Check for missing documents based on form_data ---
            const { data: appData } = await supabase
                .from('applications')
                .select('form_data, course_id, cycle_id, form_type')
                .eq('id', applicationId)
                .single();

            if (appData && appData.form_data) {
                const { data: formSchema } = await supabase
                    .from('admission_forms')
                    .select('schema_json')
                    .eq('course_id', appData.course_id)
                    .eq('cycle_id', appData.cycle_id)
                    .eq('form_type', appData.form_type)
                    .single();

                if (formSchema && formSchema.schema_json && formSchema.schema_json.fields) {
                    const fileFields = formSchema.schema_json.fields.filter((f: any) => f.type === 'file');
                    console.log(`Debug: Self-healing - Schema for ${appData.form_type} has ${fileFields.length} file fields.`);
                    
                    let newDocsAdded = false;

                    for (const field of fileFields) {
                        const key = field.key || field.name;
                        const filePath = appData.form_data[key];
                        console.log(`Debug: Checking field '${key}' (Label: ${field.label}). Path in form_data: ${filePath ? 'Found' : 'Missing'}`);
                        
                        // Check if this file is already in the fetched documents
                        // Match by document_type (label)
                        const exists = documents.some(d => d.document_type === field.label);
                        
                        if (filePath && !exists) {
                            console.log(`Debug: Found missing document in form_data: ${field.label}, restoring...`);
                            const newDoc = {
                                application_id: applicationId,
                                file_path: filePath,
                                file_name: filePath.split('/').pop() || 'restored_file',
                                document_type: field.label,
                                status: 'pending'
                            };
                            
                            const { data: insertedDoc, error: insertError } = await supabase
                                .from('documents')
                                .insert(newDoc)
                                .select()
                                .single();

                            if (insertError) {
                                console.error('Error restoring document:', insertError.message);
                            } else if (insertedDoc) {
                                documents.push(insertedDoc);
                                newDocsAdded = true;
                            }
                        }
                    }
                    if (newDocsAdded) {
                        console.log('Debug: Documents list updated with restored files.');
                    }
                }
            }
            // -------------------------------------------------------------------
        }
    }

    return {
        applications: applications || [],
        documents: documents || []
    };
};

export const actions: Actions = {
    // This action handles deletion of document records from the database AND storage AND application form_data
    delete: async ({ request, locals: { supabase, getAuthenticatedUser, userProfile } }) => {
        const authenticatedUser = await getAuthenticatedUser();
        if (!authenticatedUser || userProfile?.role !== 'student') {
            throw redirect(303, '/login');
        }

        const formData = await request.formData();
        const document_id = formData.get('document_id') as string;

        // Verify that the document belongs to the current student's application
        const { data: documentToDelete, error: docFetchError } = await supabase
            .from('documents')
            .select('application_id, file_path, document_type')
            .eq('id', document_id)
            .single();

        if (docFetchError || !documentToDelete) {
            console.error('Document not found or error fetching:', docFetchError?.message);
            return fail(404, { message: 'Document not found.', error: true });
        }

        const { count, error: appCheckError, data: appStatusData } = await supabase
            .from('applications')
            .select('id, status', { count: 'exact' }) // fetch status
            .eq('id', documentToDelete.application_id)
            .eq('student_id', userProfile.id);

        if (appCheckError || count === null || count === 0) {
            console.error('Document does not belong to student:', appCheckError?.message);
            return fail(403, { message: 'Unauthorized action.', error: true });
        }

        if (appStatusData && ['verified', 'approved'].includes(appStatusData[0].status)) {
            return fail(403, { message: 'Application is locked. Cannot delete documents.', error: true });
        }

        // 1. Delete actual file from Supabase Storage
        if (documentToDelete.file_path) {
            const { error: storageError } = await supabase.storage
                .from('documents')
                .remove([documentToDelete.file_path]);
            
            if (storageError) {
                console.error('Error deleting file from storage:', storageError.message);
                // Continue anyway to clean up DB
            }
        }

        // 2. Delete the document record from the database
        const { error: dbDeleteError } = await supabase.from('documents').delete().eq('id', document_id);

        if (dbDeleteError) {
            console.error('Error deleting document record:', dbDeleteError.message);
            return fail(500, { message: 'Failed to delete document record.', error: true });
        }

        // 3. Update Application form_data to remove reference (Prevent Self-Healing resurrection)
        const { data: appData } = await supabase
            .from('applications')
            .select('form_data')
            .eq('id', documentToDelete.application_id)
            .single();

        if (appData && appData.form_data) {
            let updatedFormData = { ...appData.form_data };
            let dataChanged = false;

            // Remove key if value matches file path
            for (const key in updatedFormData) {
                if (updatedFormData[key] === documentToDelete.file_path) {
                    delete updatedFormData[key];
                    dataChanged = true;
                }
            }
            // Also check by document_type (label) as key, just in case
            // The DynamicForm uses 'name' (key) to store data, but we matched by 'label' in self-healing.
            // Best to remove by value match.

            if (dataChanged) {
                const { error: appUpdateError } = await supabase
                    .from('applications')
                    .update({ form_data: updatedFormData })
                    .eq('id', documentToDelete.application_id);
                
                if (appUpdateError) {
                    console.error('Error syncing application form data:', appUpdateError.message);
                }
            }
        }

        return { success: true, message: 'Document deleted successfully!' };
    }
};
