import { expect, test } from 'vitest';
import { authorizeDetailOperations } from './hypothesis-detail-intent';

test('detail discussion, negation, and instructions cannot save proposed state', () => {
	for (const message of [
		"Don't save a finding yet",
		'What is the status of this?',
		'How do I set status to investigating?',
		'Can you explain how to save a finding: tracking errors?',
		'What if I mark this as investigating?'
	]) {
		expect(
			authorizeDetailOperations({
				message,
				status: 'investigating',
				finding: 'Tracking errors exist.'
			})
		).toEqual({ status: null, finding: null, suppressed: true });
	}
});

test('detail status requests must match the proposed status', () => {
	expect(
		authorizeDetailOperations({
			message: 'Please mark this as investigating.',
			status: 'investigating',
			finding: null
		})
	).toEqual({ status: 'investigating', finding: null, suppressed: false });
	expect(
		authorizeDetailOperations({
			message: 'Please mark this as investigating.',
			status: 'resolved',
			finding: null
		}).suppressed
	).toBe(true);
	expect(
		authorizeDetailOperations({
			message: 'Archive this hypothesis.',
			status: 'archived',
			finding: null
		}).suppressed
	).toBe(false);
});

test('explicit finding content and compound commands can be saved', () => {
	const finding = 'Visibility misses some corrected landmarks in the selected sample.';
	expect(
		authorizeDetailOperations({ message: `Save a finding: ${finding}`, status: null, finding })
	).toEqual({ status: null, finding, suppressed: false });
	expect(
		authorizeDetailOperations({
			message: `Mark this as investigating and save a finding: ${finding}`,
			status: 'investigating',
			finding
		})
	).toEqual({ status: 'investigating', finding, suppressed: false });
});

test('an unauthorized extra detail operation suppresses the entire proposed write', () => {
	expect(
		authorizeDetailOperations({
			message: 'Mark this as investigating.',
			status: 'investigating',
			finding: 'Unrequested finding.'
		})
	).toEqual({ status: null, finding: null, suppressed: true });
});

test('commands quoted inside finding content cannot also change the status', () => {
	const finding = 'A participant asked us to mark this as investigating.';
	expect(
		authorizeDetailOperations({
			message: `Save a finding: ${finding} And mark this as investigating.`,
			status: 'investigating',
			finding
		})
	).toEqual({ status: null, finding: null, suppressed: true });
});
