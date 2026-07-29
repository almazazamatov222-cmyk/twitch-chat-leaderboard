import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // Use service role for schema inspection if needed

async function checkSchema() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase.from('settings').select('*').limit(1);
  if (error) {
    console.error(error);
  } else {
    console.log("Columns:", Object.keys(data[0] || {}).join(', '));
  }
}

checkSchema();
