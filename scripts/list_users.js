
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function listProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, created_at, is_active')
    .limit(50)

  if (error) {
    console.error('Error fetching profiles:', error)
    return
  }

  console.log(`Found ${data.length} profiles:`)
  console.table(data)
}

listProfiles()
