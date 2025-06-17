import { fileURLToPath } from 'node:url';

export const inputFilePath = fileURLToPath(new URL('./input-file.json', import.meta.url));
