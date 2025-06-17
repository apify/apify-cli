import { platform } from 'node:os';

import { cryptoRandomObjectId } from '@apify/utilities';

export function useUniqueId(prefix: string) {
	return `${prefix}-${cryptoRandomObjectId(10)}-${platform()}`;
}
