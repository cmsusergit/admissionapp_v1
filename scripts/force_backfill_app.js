
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function forceBackfill() {
    const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const appId = 'e3796c09-3905-4368-9d1a-1290db3e7f14';
    const studentId = 'b21139f9-5ad8-487a-96f7-917d2d13a953';

    const docs = [
        { key: 'photo', type: 'Profile Photo', path: 'b21139f9-5ad8-487a-96f7-917d2d13a953/74ff2338-2fd1-4885-97dd-f0398465df01.PNG' },
        { key: 'lc_document', type: 'Leaving /Transfer Certificate', path: 'b21139f9-5ad8-487a-96f7-917d2d13a953/1184a75e-01bc-4e84-b691-e8404fcaf524.png' },
        { key: 'guject_document', type: 'GUJCET (In case of Application for BE)', path: 'b21139f9-5ad8-487a-96f7-917d2d13a953/99b0fb13-551b-4bb3-9406-063309eaf3ae.PNG' },
        { key: 'marksheet_document', type: 'Marksheet (Class 12)', path: 'b21139f9-5ad8-487a-96f7-917d2d13a953/6f94eb4e-c2da-4c37-924d-7291b5999c85.PNG' },
        { key: 'aadharcard_document', type: "Student's Aadhar Card", path: 'b21139f9-5ad8-487a-96f7-917d2d13a953/654da3ea-74e8-4abf-8d16-7ca29a46e2a6.PNG' },
        { key: 'paadharcard_document', type: "Parent's Aadhar Card", path: 'b21139f9-5ad8-487a-96f7-917d2d13a953/8ff035c3-259c-4376-b1f6-9a27d5926b07.PNG' }
    ];

    console.log(`Forcing ${docs.length} document entries for App: ${appId}`);

    for (const d of docs) {
        // Delete existing by path OR type to ensure clean state
        await supabase.from('documents').delete().eq('application_id', appId).eq('document_type', d.type);
        await supabase.from('documents').delete().eq('application_id', appId).eq('file_path', d.path);

        const { data, error } = await supabase.from('documents').insert({
            application_id: appId,
            user_id: null,
            file_path: d.path,
            file_name: d.path.split('/').pop(),
            document_type: d.type,
            status: 'pending',
            uploaded_by: studentId
        }).select().single();

        if (error) {
            console.error(`Error inserting ${d.type}:`, error.message);
        } else {
            console.log(`Inserted: ${d.type} (ID: ${data.id})`);
        }
    }
}

forceBackfill();
