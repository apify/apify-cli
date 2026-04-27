import chalk from 'chalk';

/** NUL byte — guaranteed not to appear in real markdown source. */
const SENTINEL = '\0';
const CODE_SPAN_RE = /`([^`]+)`/g;
const SENTINEL_RESTORE_RE = /\0(\d+)\0/g;
const BOLD_RE = /\*\*([\s\S]+?)\*\*/g;
const STRIKETHROUGH_RE = /~~([\s\S]+?)~~/g;
const ITALIC_ASTERISK_RE = /\*([^*\n]+)\*/g;
const ITALIC_UNDERSCORE_RE = /(?<![A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_])/g;
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const HEADER_RE = /^#{1,6}\s+(.*)$/gm;

/**
 * Minimal markdown → ANSI renderer for the `terminal` format of `t()`.
 * Handles the markdown subset we actually use in CLI messages:
 *
 *   - inline code (`` `x` ``) → cyan
 *   - bold (`**x**`)          → bold
 *   - italic (`*x*` / `_x_`)  → italic
 *   - strikethrough (`~~x~~`) → strikethrough
 *   - links (`[t](url)`)      → blue link + gray url
 *   - headers (`# x`)         → bold cyan, prefix stripped
 *
 * Code spans are extracted up front and replaced with NUL-delimited
 * placeholders so the subsequent passes can never recurse into their contents
 * (otherwise `` `**not bold**` `` would have its `**` consumed by the bold
 * pass even though it sits inside a code span).
 */
export function markdownToAnsi(input: string): string {
	const codeSpans: string[] = [];

	let out = input.replace(CODE_SPAN_RE, (_match, content: string) => {
		const idx = codeSpans.push(content) - 1;
		return `${SENTINEL}${idx}${SENTINEL}`;
	});

	out = out.replace(BOLD_RE, (_match, content: string) => chalk.bold(content));
	out = out.replace(STRIKETHROUGH_RE, (_match, content: string) => chalk.strikethrough(content));
	out = out.replace(ITALIC_ASTERISK_RE, (_match, content: string) => chalk.italic(content));
	out = out.replace(ITALIC_UNDERSCORE_RE, (_match, content: string) => chalk.italic(content));
	out = out.replace(LINK_RE, (_match, text: string, url: string) => `${chalk.blue(text)} ${chalk.gray(url)}`);
	out = out.replace(HEADER_RE, (_match, text: string) => chalk.bold.cyan(text));

	return out.replace(SENTINEL_RESTORE_RE, (_match, idxStr: string) => chalk.cyan(codeSpans[Number(idxStr)]));
}
