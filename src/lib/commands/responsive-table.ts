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

export interface ResponsiveTableOptions<
	AllColumns extends string,
	MandatoryColumns extends NoInfer<AllColumns> = AllColumns,
> {
	/**
	 * Represents all the columns the that this table should show, and their order
	 */
	allColumns: AllColumns[];
	/**
	 * Represents the columns that are mandatory for the user to see, even if the terminal size is less than adequate (<100).
	 * Make sure this field includes columns that provide enough context AND that will fit in an 80-column terminal.
	 */
	mandatoryColumns: MandatoryColumns[];
	/**
	 * By default, all columns are left-aligned. You can specify columns that should be aligned in the middle or right
	 */
	columnAlignments?: Partial<Record<AllColumns, 'left' | 'center' | 'right'>>;
}

export class ResponsiveTable<AllColumns extends string, MandatoryColumns extends NoInfer<AllColumns> = AllColumns> {
	private options: ResponsiveTableOptions<AllColumns, MandatoryColumns>;

	private rows: Record<AllColumns, string>[] = [];

	constructor(options: ResponsiveTableOptions<AllColumns, MandatoryColumns>) {
		this.options = options;
	}

	pushRow(item: Record<AllColumns, string>) {
		this.rows.push(item);
	}

	render(compactMode: CompactMode): string {
		const head = terminalColumns < 100 ? this.options.mandatoryColumns : this.options.allColumns;
		const headColors = generateHeaderColors(head.length);

		const compact = compactMode === CompactMode.VeryCompact;
		const chars = charMap[compactMode];

		const colAligns: ('left' | 'right' | 'center')[] = [];

		for (const column of head) {
			colAligns.push(this.options.columnAlignments?.[column] || 'left');
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
			const row = head.map((col) => rowData[col]);
			table.push(row);
		}

		return table.toString();
	}
}
