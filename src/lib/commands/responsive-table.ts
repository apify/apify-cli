import Table from 'cli-table3';

const compactModeChars = {
	'mid': '',
	'left-mid': '',
	'mid-mid': '',
	'right-mid': '',
	middle: ' ',
	'top-mid': '─',
	'bottom-mid': '─',
};

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

	render(compact = false): string {
		const head = terminalColumns < 100 ? this.options.mandatoryColumns : this.options.allColumns;
		const headColors = generateHeaderColors(head.length);
		const chars = compact ? compactModeChars : undefined;

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
