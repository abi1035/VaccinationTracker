import { supabase } from './supabaseClient';

// insert one submission
export async function insertSubmission({ vaccine, staff_count, resident_count, note, date_only }) {
  const { data, error } = await supabase
    .from('vaccination_submissions')
    .insert({
      vaccine,
      staff_count,
      resident_count,
      note,
      date_submitted: date_only ?? new Date().toLocaleDateString('en-CA') // "YYYY-MM-DD"
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// fetch all submissions for a vaccine (latest first)
export async function fetchSubmissions(vaccine) {
  const { data, error } = await supabase
    .from('vaccination_submissions')
    .select('*')
    .eq('vaccine', vaccine)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// fetch the latest submission per vaccine (for tiles)
export async function fetchLatest(vaccine) {
  const { data, error } = await supabase
    .from('vaccination_submissions')
    .select('*')
    .eq('vaccine', vaccine)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data; // may be null
}


export async function deleteSubmission(id) {
  const { data, error } = await supabase
    .from('vaccination_submissions')
    .delete()
    .eq('id', id)
    .select('id'); // returns deleted rows

  if (error) throw error;
  return Array.isArray(data) && data.length > 0; // true if a row was deleted
}