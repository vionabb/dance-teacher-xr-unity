import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import SupabaseDataBackend from './SupabaseDatabackend';
import type { Database } from './SupabaseTypes';

function backendWith(error: { code: string; message: string } | null) {
	const supabase = {
		from: () => ({ select: async () => ({ data: null, error }) })
	} as unknown as SupabaseClient<Database>;
	return new SupabaseDataBackend(supabase, null);
}

describe('motion video menu catalog', () => {
	it('keeps the menu available when the old learner table is absent', async () => {
		await expect(
			backendWith({
				code: 'PGRST205',
				message: 'public.motion_video is not in the schema cache'
			}).getMotionVideos()
		).resolves.toEqual([]);
	});

	it('still surfaces unrelated database errors', async () => {
		await expect(
			backendWith({ code: '42501', message: 'permission denied' }).getMotionVideos()
		).rejects.toMatchObject({ code: '42501' });
	});
});
