import { expect, test } from 'vitest';
import {
	analysisAccess,
	assertAnalysisMutation,
	groupPerformances,
	readAnalysisMutation
} from './hosted-analysis';

test('JSON writes require a matching origin and content type', () => {
	const make = (headers: Record<string, string>) =>
		new Request('https://research.example/api/research/discrepancy/recording', {
			method: 'POST',
			headers,
			body: '{}'
		});
	expect(() => assertAnalysisMutation(make({ 'content-type': 'application/json' }))).toThrow();
	expect(() =>
		assertAnalysisMutation(
			make({ origin: 'https://elsewhere.example', 'content-type': 'application/json' })
		)
	).toThrow();
	expect(() =>
		assertAnalysisMutation(
			make({ origin: 'https://research.example', 'content-type': 'text/plain' })
		)
	).toThrow();
	expect(() =>
		assertAnalysisMutation(
			make({
				origin: 'https://research.example',
				'content-type': 'application/json',
				'sec-fetch-site': 'cross-site'
			})
		)
	).toThrow();
	expect(() =>
		assertAnalysisMutation(
			make({ origin: 'https://research.example', 'content-type': 'application/json' })
		)
	).not.toThrow();
});
test('body size enforcement does not trust content-length', async () => {
	await expect(
		readAnalysisMutation(
			new Request('https://research.example/api', {
				method: 'POST',
				headers: { origin: 'https://research.example', 'content-type': 'application/json' },
				body: JSON.stringify({ note: 'x'.repeat(32_001) })
			})
		)
	).rejects.toMatchObject({ status: 413 });
});
test('writer role is tied to the current account and study', async () => {
	const access = await analysisAccess({
		user: { id: 'current-account' },
		supabase: {
			from: () => ({
				select: () => ({
					eq: (column: string, id: string) => {
						expect(column).toBe('user_id');
						expect(id).toBe('current-account');
						return {
							data: [
								{ study: 'chi25_study1', role: 'editor' },
								{ study: 'chi25_study2', role: 'viewer' }
							],
							error: null
						};
					}
				})
			})
		}
	} as never);
	expect(access.canWrite('chi25_study1')).toBe(true);
	expect(access.canWrite('chi25_study2')).toBe(false);
	expect(access.canWrite('another-study')).toBe(false);
	await expect(
		analysisAccess({ user: null, safeGetSession: async () => ({ user: null }) } as never)
	).rejects.toMatchObject({ status: 404 });
});
test('catalog identity keeps different studies and performances separate and orders segments', () => {
	const common = {
		participant_id: 42,
		dance: 'bartender',
		condition: 'control',
		phase: null,
		reference_id: null
	};
	const groups = groupPerformances([
		{ ...common, id: 'b', study: 'chi25_study1', performance_id: 'first', clip_number: 2 },
		{ ...common, id: 'a', study: 'chi25_study1', performance_id: 'first', clip_number: 1 },
		{ ...common, id: 'c', study: 'chi25_study2', performance_id: 'second', clip_number: 1 }
	] as never);
	expect(groups).toHaveLength(2);
	expect(groups[0].segments.map((row) => row.id)).toEqual(['a', 'b']);
	expect(groups.map((row) => row.study)).toEqual(['study1', 'study2']);
});
