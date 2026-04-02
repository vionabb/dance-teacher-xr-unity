export async function waitSecs(secs: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, secs * 1000);
	});
}
