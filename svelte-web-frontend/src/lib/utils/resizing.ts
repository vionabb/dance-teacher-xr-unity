export function getContentSize(element: HTMLElement) {
	var styles = getComputedStyle(element);

	return [
		element.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight),
		element.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom)
	];
}
