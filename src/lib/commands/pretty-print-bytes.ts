export function prettyPrintBytes(bytes: number): string {
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

	if (bytes === 0) {
		return '0 Byte';
	}

	const i = Math.floor(Math.log(bytes) / Math.log(1024));

	return `${(bytes / 1024 ** i).toFixed(2)} ${sizes[i]}`;
}
