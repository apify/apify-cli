const noColor = (val: string) => val;

export function prettyPrintBytes({
	bytes,
	shortBytes = false,
	colorFunc = noColor,
	precision = 2,
}: { bytes: number; shortBytes?: boolean; colorFunc?: (val: string) => string; precision?: number }): string {
	const sizes = [shortBytes ? 'B' : 'Bytes', 'KB', 'MB', 'GB', 'TB'];

	if (bytes === 0) {
		if (shortBytes) {
			return `${(0).toPrecision(precision)} B`;
		}

		return `${(0).toPrecision(precision)} Byte`;
	}

	const i = Math.floor(Math.log(bytes) / Math.log(1024));

	return `${(bytes / 1024 ** i).toFixed(precision)} ${colorFunc(sizes[i])}`;
}
