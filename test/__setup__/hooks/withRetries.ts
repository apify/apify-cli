export async function withRetries<T extends () => unknown>(func: T, retries = 3, delay = 1000) {
	let result;
	for (let i = 0; i < retries; i++) {
		try {
			result = await func();
			break;
		} catch (err) {
			if (i === retries - 1) {
				throw err;
			}

			await new Promise((resolve) => {
				setTimeout(resolve, delay);
			});
		}
	}

	return result;
}
