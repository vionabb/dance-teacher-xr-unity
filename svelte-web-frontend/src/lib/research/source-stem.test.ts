import { expect, test } from 'vitest';
import { parseRecordingStem, recordingTitle } from './source-stem';

test('reads Study 1 and Study 2 stems', () => {
	expect(
		parseRecordingStem(
			'user4751____performance____userstudy1--last-christmas--control____workflowid-0079b262____clip1'
		)
	).toEqual({ participant: 'user4751', dance: 'Last Christmas', condition: 'control', clip: '1' });
	expect(
		parseRecordingStem(
			'user3609________userstudy2-madatdisney-emojiandsegmented____workflowid-0cb498c3____clip4'
		)
	).toEqual({
		participant: 'user3609',
		dance: 'Mad at Disney',
		condition: 'emojiandsegmented',
		clip: '4'
	});
});

test('falls back to the raw stem', () => {
	expect(recordingTitle('something-else')).toBe('something-else');
});
