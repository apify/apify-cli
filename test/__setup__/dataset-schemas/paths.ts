import { fileURLToPath } from 'node:url';

export const validDatasetSchemaPath = fileURLToPath(new URL('./valid.json', import.meta.url));
