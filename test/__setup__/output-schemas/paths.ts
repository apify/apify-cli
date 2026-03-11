import { fileURLToPath } from 'node:url';

export const validOutputSchemaPath = fileURLToPath(new URL('./valid.json', import.meta.url));

export const noPropertiesOutputSchemaPath = fileURLToPath(new URL('./no-properties.json', import.meta.url));
