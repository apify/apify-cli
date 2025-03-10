declare module 'yargonaut' {
	declare class Yargonaut {
		public help(font: string): this;
		public errors(font: string): this;
		public font(font: string, key?: string): this;
		public helpStyle(font: string): this;
		public errorsStyle(font: string): this;
		public style(font: string, key?: string): this;
	}

	declare const yargonaut: Yargonaut;

	export = yargonaut;
}
