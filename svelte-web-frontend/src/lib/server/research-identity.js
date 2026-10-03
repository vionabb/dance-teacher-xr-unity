/** The CHI25 ratings CSV calls the study 1 sheet-motion condition "sheet".
 * @param {string} condition
 */
export function humanSimilarityCondition(condition) {
	return condition === 'sheetmotion' ? 'sheet' : condition;
}
