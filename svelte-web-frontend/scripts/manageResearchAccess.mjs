import { createClient } from '@supabase/supabase-js';

const accountEmail = process.env.RESEARCH_ACCOUNT_EMAIL?.trim().toLowerCase();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const studies = (process.env.RESEARCH_STUDIES ?? 'chi25_study1,chi25_study2').split(',');
const revoke = process.argv.includes('--revoke');
if (!accountEmail || !url || !key) {
	throw new Error(
		'Set RESEARCH_ACCOUNT_EMAIL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
	);
}
if (studies.some((study) => !['chi25_study1', 'chi25_study2'].includes(study))) {
	throw new Error('RESEARCH_STUDIES must contain only CHI25 study identifiers');
}

const client = createClient(url, key, { auth: { persistSession: false } });
let userId;
for (let page = 1; ; page++) {
	const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
	if (error) throw error;
	userId = data.users.find((user) => user.email?.toLowerCase() === accountEmail)?.id;
	if (userId || data.users.length < 1000) break;
}
if (!userId) throw new Error('The account must sign up before research access can be granted');

if (revoke) {
	const { error } = await client
		.from('research_access')
		.delete()
		.eq('user_id', userId)
		.in('study', studies);
	if (error) throw error;
	console.log(`Revoked access to ${studies.join(', ')}`);
} else {
	const { error } = await client.from('research_access').upsert(
		studies.map((study) => ({ user_id: userId, study, role: 'viewer' })),
		{ onConflict: 'user_id,study' }
	);
	if (error) throw error;
	console.log(`Granted viewer access to ${studies.join(', ')}`);
}
