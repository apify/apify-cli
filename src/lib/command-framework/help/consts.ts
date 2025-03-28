let cachedMaxLineWidth: number | undefined;

export function getMaxLineWidth() {
	if (cachedMaxLineWidth) {
		return cachedMaxLineWidth;
	}

	const override = Number(process.env.APIFY_CLI_MAX_LINE_WIDTH);

	if (!Number.isNaN(override)) {
		cachedMaxLineWidth = override;
	} else if (!process.stdout.isTTY) {
		cachedMaxLineWidth = 80;
	} else {
		const windowWidth = process.stdout.getWindowSize?.()[0] ?? -1;

		if (windowWidth < 1) {
			cachedMaxLineWidth = 80;
		} else if (windowWidth < 40) {
			cachedMaxLineWidth = 40;
		} else {
			cachedMaxLineWidth = windowWidth;
		}
	}

	return cachedMaxLineWidth;
}
