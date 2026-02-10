
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkUserRoles() {
  console.log('Fetching profiles and roles...')

  // 1. Fetch profiles to get user_ids and emails
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, user_id, email, full_name')
  
  if (profilesError) {
    console.error('Error fetching profiles:', profilesError)
    return
  }

  // 2. Fetch all user_roles
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('*')

  if (rolesError) {
    console.error('Error fetching user_roles:', rolesError)
    return
  }

  console.log('\n--- User Roles Analysis ---')
  
  profiles.forEach(profile => {
    const userRoles = roles.filter(r => r.user_id === profile.user_id)
    const roleNames = userRoles.map(r => r.role)
    
    console.log(`User: ${profile.email}`)
    console.log(`ID: ${profile.user_id}`)
    console.log(`Roles found: ${roleNames.length > 0 ? roleNames.join(', ') : 'NONE (Defaulting to user in app)'}`)
    console.log('---')
  })
}

checkUserRoles()
