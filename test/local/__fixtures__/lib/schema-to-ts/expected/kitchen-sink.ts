// oxlint-disable
// @generated schema-ts v1-d6f2d413923da0a4 — do not edit

export type KitchenSink = {
	aString: string;
	aNumber?: number | undefined;
	anInteger?: number | undefined;
	aBoolean?: boolean | undefined;
	aNull?: null | undefined;
	multiType?: string | number | boolean | null | undefined;
	repeatedType?: string | number | undefined;
	stringOrNull?: string | null | undefined;
	stringEnum?: 'cheerio' | 'puppeteer' | 'playwright' | undefined;
	numberEnum?: 1 | 2 | 3 | undefined;
	mixedEnum?: 'auto' | 42 | true | null | undefined;
	singleMemberEnum?: 'only' | undefined;
	repeatedEnumMembers?: 'a' | 'b' | undefined;
	enumWithNull?: 'a' | 'b' | null | undefined;
	narrowedEnum?: 'a' | 'b' | undefined;
	contradictoryEnum?: unknown;
	constString?: string | undefined;
	arrayWithoutItems?: Array<unknown> | undefined;
	arrayOfStrings?: Array<string> | undefined;
	arrayOfArrays?: Array<Array<number>> | undefined;
	arrayOfEnums?: Array<'a' | 'b'> | undefined;
	arrayOfUnions?: Array<string | number> | undefined;
	arrayOfObjectsOrNull?:
		| Array<{
				id: number;
				label?: string | null | undefined;
		  }>
		| null
		| undefined;
	openObject?:
		| {
				a?: string | undefined;
		  }
		| undefined;
	closedObject: {
		a: string;
	};
	explicitlyOpenObject?:
		| {
				a?: string | undefined;
		  }
		| undefined;
	emptyAdditionalProperties?:
		| {
				a?: string | undefined;
		  }
		| undefined;
	recordOfNumbers?: Record<string, number> | undefined;
	objectWithTypedExtras?:
		| ({
				known: string;
		  } & Record<string, number>)
		| undefined;
	propertylessObject?: Record<string, unknown> | undefined;
	closedPropertylessObject?: Record<string, never> | undefined;
	deeplyNested: {
		level1: {
			level2: Array<{
				leaf: string;
			}>;
		};
	};
	requiredWithDefault: string;
	optionalWithDefault: number;
	optionalWithoutDefault?: string | undefined;
	emptySchema?: unknown;
	'with-dash'?: string | undefined;
	'2fa'?: boolean | undefined;
	class?: string | undefined;
	$dollar_and_underscore?: string | undefined;
	''?: string | undefined;
	refToDefs?: unknown;
	refWithSiblings?: unknown;
	arrayOfRefs?: Array<unknown> | undefined;
	oneOfBranch?: unknown;
	anyOfBranch?: unknown;
	allOfBranch?: unknown;
	notBranch?: unknown;
	conditional?: unknown;
	patternKeys?: unknown;
	tupleItems?: Array<string | number> | undefined;
	objectEnum?: unknown;
	arrayEnum?: unknown;
	'escaped/key~with~specials'?: unknown;
	prefixItemsTuple?: Array<unknown> | undefined;
	unevaluatedExtras?:
		| {
				a?: string | undefined;
		  }
		| undefined;
	constrainedKeys?: Record<string, string> | undefined;
	containsANumber?: Array<unknown> | undefined;
	dependentKeys?:
		| {
				card?: string | undefined;
				billingAddress?: string | undefined;
		  }
		| undefined;
	readOnlyValue?: string | undefined;
	deprecatedValue?: string | undefined;
};

export type KitchenSinkArgs = {
	aString: string;
	aNumber?: number | undefined;
	anInteger?: number | undefined;
	aBoolean?: boolean | undefined;
	aNull?: null | undefined;
	multiType?: string | number | boolean | null | undefined;
	repeatedType?: string | number | undefined;
	stringOrNull?: string | null | undefined;
	stringEnum?: 'cheerio' | 'puppeteer' | 'playwright' | undefined;
	numberEnum?: 1 | 2 | 3 | undefined;
	mixedEnum?: 'auto' | 42 | true | null | undefined;
	singleMemberEnum?: 'only' | undefined;
	repeatedEnumMembers?: 'a' | 'b' | undefined;
	enumWithNull?: 'a' | 'b' | null | undefined;
	narrowedEnum?: 'a' | 'b' | undefined;
	contradictoryEnum?: unknown;
	constString?: string | undefined;
	arrayWithoutItems?: Array<unknown> | undefined;
	arrayOfStrings?: Array<string> | undefined;
	arrayOfArrays?: Array<Array<number>> | undefined;
	arrayOfEnums?: Array<'a' | 'b'> | undefined;
	arrayOfUnions?: Array<string | number> | undefined;
	arrayOfObjectsOrNull?:
		| Array<
				{
					id: number;
					label?: string | null | undefined;
				} & Record<string, unknown>
		  >
		| null
		| undefined;
	openObject?:
		| ({
				a?: string | undefined;
		  } & Record<string, unknown>)
		| undefined;
	closedObject: {
		a: string;
	};
	explicitlyOpenObject?:
		| ({
				a?: string | undefined;
		  } & Record<string, unknown>)
		| undefined;
	emptyAdditionalProperties?:
		| ({
				a?: string | undefined;
		  } & Record<string, unknown>)
		| undefined;
	recordOfNumbers?: Record<string, number> | undefined;
	objectWithTypedExtras?:
		| ({
				known: string;
		  } & Record<string, number>)
		| undefined;
	propertylessObject?: Record<string, unknown> | undefined;
	closedPropertylessObject?: Record<string, never> | undefined;
	deeplyNested: {
		level1: {
			level2: Array<
				{
					leaf: string;
				} & Record<string, unknown>
			>;
		} & Record<string, unknown>;
	} & Record<string, unknown>;
	requiredWithDefault: string;
	optionalWithDefault?: number | undefined;
	optionalWithoutDefault?: string | undefined;
	emptySchema?: unknown;
	'with-dash'?: string | undefined;
	'2fa'?: boolean | undefined;
	class?: string | undefined;
	$dollar_and_underscore?: string | undefined;
	''?: string | undefined;
	refToDefs?: unknown;
	refWithSiblings?: unknown;
	arrayOfRefs?: Array<unknown> | undefined;
	oneOfBranch?: unknown;
	anyOfBranch?: unknown;
	allOfBranch?: unknown;
	notBranch?: unknown;
	conditional?: unknown;
	patternKeys?: unknown;
	tupleItems?: Array<string | number> | undefined;
	objectEnum?: unknown;
	arrayEnum?: unknown;
	'escaped/key~with~specials'?: unknown;
	prefixItemsTuple?: Array<unknown> | undefined;
	unevaluatedExtras?:
		| ({
				a?: string | undefined;
		  } & Record<string, unknown>)
		| undefined;
	constrainedKeys?: Record<string, string> | undefined;
	containsANumber?: Array<unknown> | undefined;
	dependentKeys?:
		| ({
				card?: string | undefined;
				billingAddress?: string | undefined;
		  } & Record<string, unknown>)
		| undefined;
	readOnlyValue?: string | undefined;
	deprecatedValue?: string | undefined;
} & Record<string, unknown>;
