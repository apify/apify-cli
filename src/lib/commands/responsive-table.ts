import Table, { type CharName } from 'cli-table3';

const compactModeChars: Partial<Record<CharName, string>> = {
	'mid': '',
	'left-mid': '',
	'mid-mid': '',
	'right-mid': '',
	middle: ' ',
	'top-mid': '─',
	'bottom-mid': '─',
};

const compactModeCharsWithLineSeparator: Partial<Record<CharName, string>> = {
	middle: ' ',
	'top-mid': '─',
	'bottom-mid': '─',
	top: '─',
	bottom: '─',

	'left-mid': '├',
	mid: '─',
	'mid-mid': '─',
	'right-mid': '┤',
};

export enum CompactMode {
	/**
	 * Print the table as is
	 */
	None = -1,
	/**
	 * Minimized version of the table, with no separators between rows
	 */
	VeryCompact = 0,
	/**
	 * A version of the compact table that looks akin to the web console (fewer separators, but with lines between rows)
	 */
	WebLikeCompact = 1,
}

const charMap = {
	[CompactMode.None]: undefined,
	[CompactMode.VeryCompact]: compactModeChars,
	[CompactMode.WebLikeCompact]: compactModeCharsWithLineSeparator,
} satisfies Record<CompactMode, Partial<Record<CharName, string>> | undefined>;

function generateHeaderColors(length: number): string[] {
	return Array.from({ length }, () => 'cyan');
}

const terminalColumns = process.stdout.columns ?? 100;

export const kSkipColumn = Symbol.for('@apify/cli:responsive-table:skip-column');

export interface ResponsiveTableOptions<AllColumns extends string> {
	/**
	 * Represents all the columns the that this table should show, and their order
	 */
	allColumns: AllColumns[];
	/**
	 * Represents the columns that are mandatory for the user to see, even if the terminal size is less than adequate (<100).
	 * Make sure this field includes columns that provide enough context AND that will fit in an 80-column terminal.
	 */
	mandatoryColumns: NoInfer<AllColumns>[];
	/**
	 * By default, all columns are left-aligned. You can specify columns that should be aligned in the middle or right
	 */
	columnAlignments?: Partial<Record<AllColumns, 'left' | 'center' | 'right'>>;
	/**
	 * An array of hidden columns, that can be used to store extra data in a table row, to then render differently in the table based on size constraints
	 */
	hiddenColumns?: NoInfer<AllColumns>[];
	/**
	 * A set of different column and value overrides for specific columns based on size constraints
	 */
	breakpointOverrides?: {
		small: {
			[column in NoInfer<AllColumns>]?: {
				label?: string;
				/**
				 * The actual column to fetch the value from
				 */
				valueFrom?: NoInfer<AllColumns>;
			};
		};
	};
}

export class ResponsiveTable<AllColumns extends string> {
	private options: ResponsiveTableOptions<AllColumns>;

	private rows: Record<AllColumns, string | typeof kSkipColumn>[] = [];

	constructor(options: ResponsiveTableOptions<AllColumns>) {
		this.options = options;
	}

	pushRow(item: Record<AllColumns, string | typeof kSkipColumn>) {
		this.rows.push(item);
	}

	render(compactMode: CompactMode): string {
		const rawHead = ResponsiveTable.isSmallTerminal() ? this.options.mandatoryColumns : this.options.allColumns;
		const headColors = generateHeaderColors(rawHead.length);

		const compact = compactMode === CompactMode.VeryCompact;
		const chars = charMap[compactMode];

		const colAligns: ('left' | 'right' | 'center')[] = [];

		const head: string[] = [];
		const headKeys: NoInfer<AllColumns>[] = [];

		for (const column of rawHead) {
			// Skip all hidden columns
			if (this.options.hiddenColumns?.includes(column)) {
				continue;
			}

			// If there's even one row that is set to have a skipped column value, skip it
			if (this.rows.some((row) => row[column] === kSkipColumn)) {
				continue;
			}

			// Column alignment
			colAligns.push(this.options.columnAlignments?.[column] || 'left');

			if (ResponsiveTable.isSmallTerminal()) {
				// Header titles
				head.push(this.options.breakpointOverrides?.small?.[column]?.label ?? column);

				// Actual key to get the value from
				headKeys.push(this.options.breakpointOverrides?.small?.[column]?.valueFrom ?? column);
			} else {
				// Always use full values
				head.push(column);
				headKeys.push(column);
			}
		}

		const table = new Table({
			head,
			style: {
				head: headColors,
				compact,
			},
			colAligns,
			chars,
		});

		for (const rowData of this.rows) {
			const row = headKeys.map((col) => rowData[col] as string);
			table.push(row);
		}

		return table.toString();
	}

	static isSmallTerminal() {
		return terminalColumns < 100;
	}
}
