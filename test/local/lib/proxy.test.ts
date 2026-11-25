import { useProxyFromEnv } from '../../../src/lib/proxy.js';

describe('useProxyFromEnv()', () => {
	const setGlobalProxyFromEnv = vi.fn(() => () => {});

	beforeEach(() => {
		setGlobalProxyFromEnv.mockClear();
	});

	it('turns the proxy on when the environment names one', () => {
		const env = { https_proxy: 'http://proxy.example.com:3128' };
		useProxyFromEnv(env, setGlobalProxyFromEnv);

		expect(setGlobalProxyFromEnv).toHaveBeenCalledExactlyOnceWith(env);
	});

	it('does nothing without a proxy variable', () => {
		useProxyFromEnv({ NO_PROXY: 'localhost' }, setGlobalProxyFromEnv);

		expect(setGlobalProxyFromEnv).not.toHaveBeenCalled();
	});

	it('leaves it to Node.js when NODE_USE_ENV_PROXY is set', () => {
		useProxyFromEnv({ HTTP_PROXY: 'http://proxy.example.com:3128', NODE_USE_ENV_PROXY: '1' }, setGlobalProxyFromEnv);

		expect(setGlobalProxyFromEnv).not.toHaveBeenCalled();
	});

	it('ignores a proxy URL that Node.js rejects', () => {
		setGlobalProxyFromEnv.mockImplementationOnce(() => {
			throw new TypeError('Invalid URL');
		});

		expect(() => useProxyFromEnv({ HTTP_PROXY: 'not a url' }, setGlobalProxyFromEnv)).not.toThrow();
	});
});
