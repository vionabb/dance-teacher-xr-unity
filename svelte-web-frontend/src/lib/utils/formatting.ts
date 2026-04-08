export function replaceJSONForStringifyDisplay(key: string | number, value: unknown) {
	// If the value is a map, convert it to an object
	if (value instanceof Map) {
		return Object.fromEntries(value);
	}

	// Limit decimals to 2 for floats
	if (typeof value === 'number' && value?.toFixed) {
		return parseFloat(value.toFixed(2));
	}

	return value;
}

const enOrdinalRules = new Intl.PluralRules('en-US', { type: 'ordinal' });

const suffixes = new Map([
	['one', 'st'],
	['two', 'nd'],
	['few', 'rd'],
	['other', 'th']
]);

/**
 * Takes a number and returns a string representing the ordinal of the number
 * @param n Number to format as an ordinal
 * @returns A string representing the ordinal of the number
 *
 * @example
 * formatOrdinals(0) // "0th"
 * formatOrdinals(1) // "1st"
 * formatOrdinals(2) // "2nd"
 * formatOrdinals(3) // "3rd"
 * formatOrdinals(4) // "4th"
 * formatOrdinals(11) // "11th" (not "11st")
 * formatOrdinals(13) // "13th" (not "13rd")
 * formatOrdinals(21) // "21st"
 */
export function formatOrdinals(n: number) {
	const rule = enOrdinalRules.select(n);
	const suffix = suffixes.get(rule);
	return `${n}${suffix}`;
}
