import mime from 'mime';

import { getLocalInput } from '../utils.js';

export function resolveInput(cwd: string, inputOverride: Record<string, unknown> | undefined) {
    let inputToUse: Record<string, unknown> | undefined;
    let contentType!: string;

    if (inputOverride) {
        inputToUse = inputOverride;
        contentType = 'application/json';
    } else {
        const localInput = getLocalInput(cwd);

        if (localInput) {
            const ext = mime.getExtension(localInput.contentType!);

            if (ext === 'json') {
                inputToUse = JSON.parse(localInput.body.toString('utf8'));
                contentType = 'application/json';
            } else {
                inputToUse = localInput.body as never;
                contentType = localInput.contentType!;
            }
        }
    }

    if (!inputToUse || !contentType) {
        return null;
    }

    return { inputToUse, contentType };
}
