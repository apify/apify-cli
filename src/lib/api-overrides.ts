// API fields that the hand-written apify-client types lack. Each type names its schema in
// https://docs.apify.com/api/openapi.json. Remove an entry when apify-client covers it.
import type {
	Actor,
	ActorVersionSourceFile,
	Build,
	BuildCollectionClientListItem,
	KeyValueStore,
	UserPlan,
} from 'apify-client';

// BuildListItem, https://github.com/apify/apify-client-js/issues/526
export type ApiBuildListItem = BuildCollectionClientListItem & { buildNumber: string };

// Build and BuildStats, https://github.com/apify/apify-client-js/issues/526
export type ApiBuild = Omit<Build, 'stats'> & {
	exitCode?: number | null;
	stats?: Build['stats'] & { imageSizeBytes?: number | null };
};

// KeyValueStoreStats: the list endpoint returns `s3StorageBytes`, the single GET returns `storageBytes`.
export type ApiKeyValueStoreListItem = Omit<KeyValueStore, 'stats'> & {
	stats?: KeyValueStore['stats'] & { s3StorageBytes?: number };
};

// SourceCodeFolder: a version's `sourceFiles` also lists folders, which have no content.
export type ApiSourceFile = ActorVersionSourceFile | { name: string; folder: true };

// UserPlan.planPricing is an untyped object in the spec; the shape is from the live `GET /v2/users/me`.
export type ApiUserPlan = UserPlan & {
	planPricing?: {
		chargeableServiceUnitPricesUsd?: {
			DATASET_TIMED_STORAGE_GBYTE_HOURS: number;
			KEY_VALUE_STORE_TIMED_STORAGE_GBYTE_HOURS: number;
		};
	};
};

// ActorResource
export type ApiActor = Actor & { isCritical?: boolean };

// UpdateActorRequest.taggedBuilds: `{ buildId }` moves a tag, `null` removes it.
export type ApiTaggedBuildsUpdate = Record<string, { buildId: string } | null>;
