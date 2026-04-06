// Headlines for feedback when the user danced well
const GoodTrialHeadlines = Object.freeze([
	'Nice Job!',
	'Great Moves!',
	"You're Killing It!",
	'Awesome Dancing!',
	'Keep It Up!',
	'Incredible Rhythm!',
	'Impressive Dancing!',
	'Amazing Performance!',
	"You've Got the Groove!",
	"You're a Dancing Machine!",
	'Phenomenal Footwork!',
	"You're a Star!",
	'Excellent Execution!',
	"You're on Fire!",
	'Superb Dancing!',
	"You're a Pro!",
	'Outstanding Performance!'
]);
const lastGoodTrialHeadlineIndex = -1;
export function getRandomGoodTrialHeadline() {
	let index = lastGoodTrialHeadlineIndex;
	while (index === lastGoodTrialHeadlineIndex) {
		index = Math.floor(Math.random() * GoodTrialHeadlines.length);
	}
	return GoodTrialHeadlines[index];
}

// Headlines for feedback when the user didn't do particularly well (and should try again).
const BadTrialHeadline = Object.freeze([
	"Don't Give Up!",
	'Keep Pushing!',
	"You've Got This!",
	'Stay Strong!',
	'Keep Going!',
	'Believe In Yourself!',
	'Stay Focused!',
	'Never Give Up!',
	'You Can Do It!',
	'Stay Motivated!',
	'Keep Moving Forward!',
	'Stay Resilient!',
	'Stay Positive!',
	'Stay Determined!',
	'Stay Committed!',
	'Stay Persistent!',
	'Stay Confident!',
	'Stay Inspired!',
	'Stay Driven!',
	'Stay Tenacious!'
]);

const lastBadTrialHeadlineIndex = -1;
export function getRandomBadTrialHeadline() {
	let index = lastBadTrialHeadlineIndex;
	while (index === lastBadTrialHeadlineIndex) {
		index = Math.floor(Math.random() * BadTrialHeadline.length);
	}
	return BadTrialHeadline[index];
}

const NoFeedbackHeadlines = Object.freeze([
	'What next?',
	'What are you thinking now?',
	'What do you think?',
	'How did you feel?'
]);

const lastNoFeedbackHeadlineIndex = -1;
export function getRandomNoFeedbackHeadline() {
	let index = lastNoFeedbackHeadlineIndex;
	while (index === lastNoFeedbackHeadlineIndex) {
		index = Math.floor(Math.random() * NoFeedbackHeadlines.length);
	}
	return NoFeedbackHeadlines[index];
}
