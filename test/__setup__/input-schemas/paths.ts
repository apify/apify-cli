import { fileURLToPath } from 'node:url';

export const defaultsInputSchemaPath = fileURLToPath(new URL('./defaults.json', import.meta.url));

export const invalidInputSchemaPath = fileURLToPath(new URL('./invalid.json', import.meta.url));

export const missingRequiredPropertyInputSchemaPath = fileURLToPath(
	new URL('./missing-required-property.json', import.meta.url),
);

export const prefillsInputSchemaPath = fileURLToPath(new URL('./prefills.json', import.meta.url));

export const unparsableInputSchemaPath = fileURLToPath(new URL('./unparsable.json', import.meta.url));

export const validInputSchemaPath = fileURLToPath(new URL('./valid.json', import.meta.url));
