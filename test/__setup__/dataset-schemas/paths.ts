import { fileURLToPath } from 'node:url';

export const validDatasetSchemaPath = fileURLToPath(new URL('./valid.json', import.meta.url));

export const emptyFieldsDatasetSchemaPath = fileURLToPath(new URL('./empty-fields.json', import.meta.url));

export const noTypeDatasetSchemaPath = fileURLToPath(new URL('./no-type.json', import.meta.url));

export const noFieldsDatasetSchemaPath = fileURLToPath(new URL('./no-fields.json', import.meta.url));
