import { readFileSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

/** Name of a key-value store's own metadata file, as written by crawlee's storage clients. */
const STORE_METADATA_FILE_NAME = '__metadata__.json';

/** Suffix of a key-value store record's metadata sidecar, as written by crawlee's storage clients. */
const RECORD_METADATA_SUFFIX = `.${STORE_METADATA_FILE_NAME}`;

export interface KvsRecordMetadata {
	key: string;
	contentType: string;
	/** Name of the value file on disk, when it is not the encoded key. */
	filename?: string;
}

/**
 * Percent-encode a record key into its on-disk name, the way crawlee's storage clients do
 * (Python's `quote(key, safe='')`, which leaves `-._~` alone).
 */
export function encodeRecordKey(key: string) {
	return encodeURIComponent(key).replaceAll(
		/[!'()*]/g,
		(character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

export const recordMetadataFileName = (key: string) => `${encodeRecordKey(key)}${RECORD_METADATA_SUFFIX}`;

/**
 * Write a record's value file plus the sidecar binding `key` to it.
 *
 * The binding is what lets a reader open `INPUT.json` under the bare `INPUT` key instead of
 * probing extensions. `size` is deliberately omitted: readers fall back to the value file's
 * length, so an Actor overwriting the value cannot leave a stale size behind.
 */
export async function writeKvsRecord({
	storePath,
	key,
	fileName,
	contentType,
	body,
}: {
	storePath: string;
	key: string;
	fileName: string;
	contentType: string;
	body: string | Buffer;
}) {
	const metadata: KvsRecordMetadata = { key, contentType };

	if (fileName !== encodeRecordKey(key)) {
		metadata.filename = fileName;
	}

	await Promise.all([
		writeFile(join(storePath, fileName), body),
		writeFile(join(storePath, recordMetadataFileName(key)), JSON.stringify(metadata, null, 2)),
	]);
}

/** Read a record's metadata sidecar, or undefined when there is no usable one. */
export function readKvsRecordMetadata(storePath: string, key: string): KvsRecordMetadata | undefined {
	let metadata: KvsRecordMetadata;

	try {
		metadata = JSON.parse(readFileSync(join(storePath, recordMetadataFileName(key)), 'utf8'));
	} catch {
		return undefined;
	}

	if (typeof metadata?.contentType !== 'string') {
		return undefined;
	}

	const { filename } = metadata;

	// A sidecar may only bind its key to a plain file in the store itself.
	const bindsToStoreFile =
		filename === undefined ||
		(typeof filename === 'string' &&
			!['', '.', '..'].includes(filename) &&
			basename(filename) === filename &&
			filename !== STORE_METADATA_FILE_NAME &&
			!filename.endsWith(RECORD_METADATA_SUFFIX));

	return bindsToStoreFile ? metadata : undefined;
}

/** Delete a record's value file and its metadata sidecar. Missing files are not an error. */
export async function deleteKvsRecord(valueFilePath: string, key: string) {
	await Promise.all([
		rm(valueFilePath, { force: true }),
		rm(join(dirname(valueFilePath), recordMetadataFileName(key)), { force: true }),
	]);
}
