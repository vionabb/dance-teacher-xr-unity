<script lang="ts" context="module">
	import { readonly, writable } from 'svelte/store';

	const supportingSpeechRecognition = writable(false);
	const supportingSpeechSynthesis = writable(false);

	export const supportsSpeechRecognition = readonly(supportingSpeechRecognition);
	export const supportsSpeechSynthesis = readonly(supportingSpeechSynthesis);

	if (browser) {
		const SpeechRecognitionConstructor: any | undefined =
			(window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
		const speechRecognition = SpeechRecognitionConstructor
			? new SpeechRecognitionConstructor()
			: null;
		supportingSpeechRecognition.set(!!speechRecognition);

		const speechSynthesis = window.speechSynthesis;
		supportingSpeechSynthesis.set(!!speechSynthesis);
	}
</script>

<script lang="ts">
	import { browser } from '$app/environment';
	import { createEventDispatcher, onMount, tick } from 'svelte';
	import { useTextToSpeech } from '$lib/model/settings';
	import { lerp } from '$lib/utils/math';
	import { text } from '@sveltejs/kit';

	export let textToSpeak: string = '';

	const dispatch = createEventDispatcher();

	let currentUtterance: SpeechSynthesisUtterance | undefined = undefined;
	let speechSythensizer: SpeechSynthesis | undefined;
	let speechRecognition: any | undefined;

	let alreadySpokenText = '';
	let currentlySpeakingText = '';
	let notYetSpokenText = '';

	const wait = (secs: number) => new Promise((resolve) => setTimeout(resolve, secs * 1000));

	function getPauseAfterWord(word: string) {
		const endsWithNewline = word.endsWith('\n');
		word = word.trim();

		const speedModifier = 1.5;
		const wordLength = word.length;
		const pauseAfterWord = lerp(wordLength / 10, 0, 1, 0.07, 0.3, true);
		if (endsWithNewline) return pauseAfterWord + 0.5;
		if (word.endsWith('.')) return pauseAfterWord + 0.35;
		if (word.endsWith('!')) return pauseAfterWord + 0.35;
		if (word == '-') return 0.4;
		if (word.endsWith(',')) return pauseAfterWord + 0.25;
		return pauseAfterWord / speedModifier;
	}

	function getNextWordWithEndIndex(text: string) {
		let nextWhitespaceIndex = text.length;
		const match = /\S+(\s)/.exec(text);
		if (match) {
			const matchStartIndex = match.index ?? 0;
			const firstWordLength = match[0].length;
			nextWhitespaceIndex = matchStartIndex + firstWordLength;
		}

		const nextWord = text.slice(0, nextWhitespaceIndex);
		return [nextWord, nextWhitespaceIndex] as const;
	}

	function outputAnotherWord() {
		const [nextWord, nextWhitespace] = getNextWordWithEndIndex(notYetSpokenText);
		alreadySpokenText += currentlySpeakingText;
		currentlySpeakingText = nextWord;
		notYetSpokenText = notYetSpokenText.slice(nextWhitespace);
		return nextWord;
	}

	let cancelSpeechSynthesis = true;
	async function displayTextWithoutSpeechSynthesis(text: string) {
		notYetSpokenText = text;
		currentlySpeakingText = '';
		alreadySpokenText = '';

		while (notYetSpokenText.length > 0) {
			if (cancelSpeechSynthesis) {
				cancelSpeechSynthesis = false;
				return;
			}
			const outputtedWord = outputAnotherWord();
			await wait(getPauseAfterWord(outputtedWord));
			await tick();
		}
		alreadySpokenText += currentlySpeakingText;
		currentlySpeakingText = '';
		dispatch('speech-ended');
	}

	const speakWithSpeechSynthesis = !browser
		? displayTextWithoutSpeechSynthesis
		: async function speakWithSpeechSynthesis(text: string) {
				currentlySpeakingText = '';
				alreadySpokenText = '';
				notYetSpokenText = text;

				if (!speechSythensizer) {
					return;
				}

				if (currentUtterance) {
					currentUtterance.onend = () => {};
					currentUtterance.onerror = () => {};
					speechSythensizer.cancel();
					currentUtterance = undefined;
				}

				const utterance = new SpeechSynthesisUtterance(text);
				return new Promise<void>((resolve, reject) => {
					if (!speechSythensizer) {
						reject('Speech synthesis is not supported on this browser');
						return;
					}

					utterance.onend = () => {
						alreadySpokenText = textToSpeak;
						currentlySpeakingText = '';
						notYetSpokenText = '';
						resolve();
						dispatch('speech-ended');
					};
					utterance.onerror = (event) => {
						reject(event.error);
					};
					utterance.onboundary = (event) => {
						alreadySpokenText = textToSpeak.slice(0, event.charIndex);
						const remainingText = textToSpeak.slice(event.charIndex);
						const [nextWord, nextWhitespace] = getNextWordWithEndIndex(remainingText);
						currentlySpeakingText = nextWord;
						notYetSpokenText = remainingText.slice(nextWhitespace);

						if (cancelSpeechSynthesis) {
							speechSynthesis?.cancel();
							console.log('Cancelling speech synthesis');
						}
					};
					currentUtterance = utterance;
					speechSythensizer.speak(utterance);
				});
			};

	// default to the fallback speak method
	let speak = displayTextWithoutSpeechSynthesis;

	$: {
		if ($useTextToSpeech) {
			speak = speakWithSpeechSynthesis;
		} else {
			speak = displayTextWithoutSpeechSynthesis;
		}
	}

	// Call speak method whenever the textToSpeak variable or the speak method
	// itself changes.
	let textToSpeakPrevious = '';
	let speakPrevious = speak;
	let isMounted = false;
	$: {
		if ((isMounted && textToSpeak !== textToSpeakPrevious) || speak !== speakPrevious) {
			textToSpeakPrevious = textToSpeak;
			speakPrevious = speak;
			speechSythensizer?.cancel();
			cancelSpeechSynthesis = true;
			wait(0.5).then(() => {
				cancelSpeechSynthesis = false;
				speak(textToSpeak);
			});
		}
	}

	// The following code uses apis that can only be used in the browser. We don't want
	// sveltekit to try to run this code on the server while hydrating / prerendering
	// the page, so we wrap it in a check for the browser environment.
	onMount(() => {
		if (!browser) {
			return;
		}
		console.log('SpeechInterface mounted');
		speechSythensizer = window.speechSynthesis;

		const SpeechRecognitionConstructor: any | undefined =
			(window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
		speechRecognition = SpeechRecognitionConstructor ? new SpeechRecognitionConstructor() : null;

		isMounted = true;

		// cleanup code on dismount
		return () => {
			isMounted = false;
			console.log('SpeechInterface dismounted');
			speechSythensizer?.cancel();
		};
	});
</script>

<div class:supportsSpeechRecognition>
	<span class="already-spoken">{alreadySpokenText}</span><span class="currently-speaking"
		>{currentlySpeakingText}</span
	><span class="not-yet-spoken">{notYetSpokenText}</span>
</div>

<style lang="scss">
	div {
		white-space: pre-wrap;
	}

	.currently-speaking {
		font-weight: bold;
	}

	.not-yet-spoken {
		color: var(--color-text-disabled);
	}
</style>
