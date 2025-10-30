/**
 * Lazy loader utility for heavy modules
 * Delays loading until first use to improve initial bundle size
 */

class Loader<T> {
	private modules?: T;

	constructor(
		private readonly name: string,
		private readonly initializer: () => Promise<T>
	) {}

	public get = async (): Promise<T> => {
		if (this.modules === undefined) {
			console.log(`Loading ${this.name} modules`);
			this.modules = await this.initializer();
		}

		return this.modules;
	};
}

export default Loader;

