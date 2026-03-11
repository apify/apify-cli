import { fileURLToPath } from 'node:url';

export const validKvsSchemaPath = fileURLToPath(new URL('./valid.json', import.meta.url));
