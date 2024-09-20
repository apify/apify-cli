export function prettyPrintBytes(bytes: number, shortBytes = false): string {
	const sizes = [shortBytes ? 'B' : 'Bytes', 'KB', 'MB', 'GB', 'TB'];

	if (bytes === 0) {
		if (shortBytes) {
			return '0.00 B';
		}

		return '0.00 Byte';
	}

	const i = Math.floor(Math.log(bytes) / Math.log(1024));

	return `${(bytes / 1024 ** i).toFixed(2)} ${sizes[i]}`;
}
