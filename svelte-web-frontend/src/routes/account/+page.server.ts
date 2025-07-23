import { fail, redirect } from '@sveltejs/kit'

export const load = async ({ locals: { supabase, session, user } }) => {
  
  if (!session || !user) {
    redirect(303, '/');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(`username, full_name, avatar_url`)
    .eq('id', user.id)
    .single()

  return { session, profile }
}

export const actions = {
  update: async ({ request, locals: { supabase, safeGetSession, user, session } }) => {
    const formData = await request.formData()
    const fullName = formData.get('fullName') as string
    const username = formData.get('username') as string
    const avatarUrl = formData.get('avatarUrl') as string

    const { error } = await supabase.from('profiles').upsert({
      id: user?.id,
      full_name: fullName,
      username,
      avatar_url: avatarUrl,
      updated_at: new Date(),
    })

    if (error) {
      
      return fail(500, {
        error,  
      })
    }

    return {
      fullName,
      username,
      avatarUrl,
      success: true,
    }
  },
  signout: async ({ locals: { supabase, session } }) => {
    if (session) {
      await supabase.auth.signOut()
      redirect(303, '/');
    }
  },
}