/* eslint-disable */
//prettier-ignore
module.exports = {
	name: '@yarnpkg/plugin-git-hooks',
	factory: function (require) {
		var plugin = (() => {
			var p = Object.create;
			var i = Object.defineProperty;
			var u = Object.getOwnPropertyDescriptor;
			var l = Object.getOwnPropertyNames;
			var P = Object.getPrototypeOf,
				m = Object.prototype.hasOwnProperty;
			var _ = ((n) =>
				typeof require < 'u'
					? require
					: typeof Proxy < 'u'
						? new Proxy(n, { get: (e, E) => (typeof require < 'u' ? require : e)[E] })
						: n)(function (n) {
				if (typeof require < 'u') return require.apply(this, arguments);
				throw new Error('Dynamic require of "' + n + '" is not supported');
			});
			var c = (n, e) => () => (e || n((e = { exports: {} }).exports, e), e.exports),
				A = (n, e) => {
					for (var E in e) i(n, E, { get: e[E], enumerable: !0 });
				},
				C = (n, e, E, s) => {
					if ((e && typeof e == 'object') || typeof e == 'function')
						for (let I of l(e))
							!m.call(n, I) &&
								I !== E &&
								i(n, I, { get: () => e[I], enumerable: !(s = u(e, I)) || s.enumerable });
					return n;
				};
			var U = (n, e, E) => (
					(E = n != null ? p(P(n)) : {}),
					C(e || !n || !n.__esModule ? i(E, 'default', { value: n, enumerable: !0 }) : E, n)
				),
				v = (n) => C(i({}, '__esModule', { value: !0 }), n);
			var L = c((M, B) => {
				B.exports = [
					{ name: 'Appcircle', constant: 'APPCIRCLE', env: 'AC_APPCIRCLE' },
					{ name: 'AppVeyor', constant: 'APPVEYOR', env: 'APPVEYOR', pr: 'APPVEYOR_PULL_REQUEST_NUMBER' },
					{ name: 'AWS CodeBuild', constant: 'CODEBUILD', env: 'CODEBUILD_BUILD_ARN' },
					{
						name: 'Azure Pipelines',
						constant: 'AZURE_PIPELINES',
						env: 'SYSTEM_TEAMFOUNDATIONCOLLECTIONURI',
						pr: 'SYSTEM_PULLREQUEST_PULLREQUESTID',
					},
					{ name: 'Bamboo', constant: 'BAMBOO', env: 'bamboo_planKey' },
					{
						name: 'Bitbucket Pipelines',
						constant: 'BITBUCKET',
						env: 'BITBUCKET_COMMIT',
						pr: 'BITBUCKET_PR_ID',
					},
					{ name: 'Bitrise', constant: 'BITRISE', env: 'BITRISE_IO', pr: 'BITRISE_PULL_REQUEST' },
					{
						name: 'Buddy',
						constant: 'BUDDY',
						env: 'BUDDY_WORKSPACE_ID',
						pr: 'BUDDY_EXECUTION_PULL_REQUEST_ID',
					},
					{
						name: 'Buildkite',
						constant: 'BUILDKITE',
						env: 'BUILDKITE',
						pr: { env: 'BUILDKITE_PULL_REQUEST', ne: 'false' },
					},
					{ name: 'CircleCI', constant: 'CIRCLE', env: 'CIRCLECI', pr: 'CIRCLE_PULL_REQUEST' },
					{ name: 'Cirrus CI', constant: 'CIRRUS', env: 'CIRRUS_CI', pr: 'CIRRUS_PR' },
					{
						name: 'Codefresh',
						constant: 'CODEFRESH',
						env: 'CF_BUILD_ID',
						pr: { any: ['CF_PULL_REQUEST_NUMBER', 'CF_PULL_REQUEST_ID'] },
					},
					{ name: 'Codemagic', constant: 'CODEMAGIC', env: 'CM_BUILD_ID', pr: 'CM_PULL_REQUEST' },
					{ name: 'Codeship', constant: 'CODESHIP', env: { CI_NAME: 'codeship' } },
					{ name: 'Drone', constant: 'DRONE', env: 'DRONE', pr: { DRONE_BUILD_EVENT: 'pull_request' } },
					{ name: 'dsari', constant: 'DSARI', env: 'DSARI' },
					{ name: 'Expo Application Services', constant: 'EAS', env: 'EAS_BUILD' },
					{ name: 'Gerrit', constant: 'GERRIT', env: 'GERRIT_PROJECT' },
					{
						name: 'GitHub Actions',
						constant: 'GITHUB_ACTIONS',
						env: 'GITHUB_ACTIONS',
						pr: { GITHUB_EVENT_NAME: 'pull_request' },
					},
					{ name: 'GitLab CI', constant: 'GITLAB', env: 'GITLAB_CI', pr: 'CI_MERGE_REQUEST_ID' },
					{ name: 'GoCD', constant: 'GOCD', env: 'GO_PIPELINE_LABEL' },
					{ name: 'Google Cloud Build', constant: 'GOOGLE_CLOUD_BUILD', env: 'BUILDER_OUTPUT' },
					{ name: 'Harness CI', constant: 'HARNESS', env: 'HARNESS_BUILD_ID' },
					{
						name: 'Heroku',
						constant: 'HEROKU',
						env: { env: 'NODE', includes: '/app/.heroku/node/bin/node' },
					},
					{ name: 'Hudson', constant: 'HUDSON', env: 'HUDSON_URL' },
					{
						name: 'Jenkins',
						constant: 'JENKINS',
						env: ['JENKINS_URL', 'BUILD_ID'],
						pr: { any: ['ghprbPullId', 'CHANGE_ID'] },
					},
					{ name: 'LayerCI', constant: 'LAYERCI', env: 'LAYERCI', pr: 'LAYERCI_PULL_REQUEST' },
					{ name: 'Magnum CI', constant: 'MAGNUM', env: 'MAGNUM' },
					{
						name: 'Netlify CI',
						constant: 'NETLIFY',
						env: 'NETLIFY',
						pr: { env: 'PULL_REQUEST', ne: 'false' },
					},
					{
						name: 'Nevercode',
						constant: 'NEVERCODE',
						env: 'NEVERCODE',
						pr: { env: 'NEVERCODE_PULL_REQUEST', ne: 'false' },
					},
					{ name: 'ReleaseHub', constant: 'RELEASEHUB', env: 'RELEASE_BUILD_ID' },
					{ name: 'Render', constant: 'RENDER', env: 'RENDER', pr: { IS_PULL_REQUEST: 'true' } },
					{ name: 'Sail CI', constant: 'SAIL', env: 'SAILCI', pr: 'SAIL_PULL_REQUEST_NUMBER' },
					{
						name: 'Screwdriver',
						constant: 'SCREWDRIVER',
						env: 'SCREWDRIVER',
						pr: { env: 'SD_PULL_REQUEST', ne: 'false' },
					},
					{ name: 'Semaphore', constant: 'SEMAPHORE', env: 'SEMAPHORE', pr: 'PULL_REQUEST_NUMBER' },
					{ name: 'Shippable', constant: 'SHIPPABLE', env: 'SHIPPABLE', pr: { IS_PULL_REQUEST: 'true' } },
					{ name: 'Solano CI', constant: 'SOLANO', env: 'TDDIUM', pr: 'TDDIUM_PR_ID' },
					{ name: 'Sourcehut', constant: 'SOURCEHUT', env: { CI_NAME: 'sourcehut' } },
					{ name: 'Strider CD', constant: 'STRIDER', env: 'STRIDER' },
					{ name: 'TaskCluster', constant: 'TASKCLUSTER', env: ['TASK_ID', 'RUN_ID'] },
					{ name: 'TeamCity', constant: 'TEAMCITY', env: 'TEAMCITY_VERSION' },
					{
						name: 'Travis CI',
						constant: 'TRAVIS',
						env: 'TRAVIS',
						pr: { env: 'TRAVIS_PULL_REQUEST', ne: 'false' },
					},
					{ name: 'Vercel', constant: 'VERCEL', env: { any: ['NOW_BUILDER', 'VERCEL'] } },
					{ name: 'Visual Studio App Center', constant: 'APPCENTER', env: 'APPCENTER_BUILD_ID' },
					{
						name: 'Woodpecker',
						constant: 'WOODPECKER',
						env: { CI: 'woodpecker' },
						pr: { CI_BUILD_EVENT: 'pull_request' },
					},
					{
						name: 'Xcode Cloud',
						constant: 'XCODE_CLOUD',
						env: 'CI_XCODE_PROJECT',
						pr: 'CI_PULL_REQUEST_NUMBER',
					},
					{ name: 'Xcode Server', constant: 'XCODE_SERVER', env: 'XCS' },
				];
			});
			var T = c((a) => {
				'use strict';
				var D = L(),
					t = process.env;
				Object.defineProperty(a, '_vendors', {
					value: D.map(function (n) {
						return n.constant;
					}),
				});
				a.name = null;
				a.isPR = null;
				D.forEach(function (n) {
					let E = (Array.isArray(n.env) ? n.env : [n.env]).every(function (s) {
						return S(s);
					});
					if (((a[n.constant] = E), !!E))
						switch (((a.name = n.name), typeof n.pr)) {
							case 'string':
								a.isPR = !!t[n.pr];
								break;
							case 'object':
								'env' in n.pr
									? (a.isPR = n.pr.env in t && t[n.pr.env] !== n.pr.ne)
									: 'any' in n.pr
										? (a.isPR = n.pr.any.some(function (s) {
												return !!t[s];
											}))
										: (a.isPR = S(n.pr));
								break;
							default:
								a.isPR = null;
						}
				});
				a.isCI = !!(
					t.CI !== 'false' &&
					(t.BUILD_ID ||
						t.BUILD_NUMBER ||
						t.CI ||
						t.CI_APP_ID ||
						t.CI_BUILD_ID ||
						t.CI_BUILD_NUMBER ||
						t.CI_NAME ||
						t.CONTINUOUS_INTEGRATION ||
						t.RUN_ID ||
						a.name ||
						!1)
				);
				function S(n) {
					return typeof n == 'string'
						? !!t[n]
						: 'env' in n
							? t[n.env] && t[n.env].includes(n.includes)
							: 'any' in n
								? n.any.some(function (e) {
										return !!t[e];
									})
								: Object.keys(n).every(function (e) {
										return t[e] === n[e];
									});
				}
			});
			var d = {};
			A(d, { default: () => O });
			var o = U(_('process')),
				r = _('@yarnpkg/core'),
				R = U(T()),
				N = {
					configuration: {
						gitHooksPath: {
							description: 'Path to git hooks directory (recommended: .github/hooks)',
							type: r.SettingsType.STRING,
							default: null,
						},
						disableGitHooks: {
							description: 'Disable automatic git hooks installation',
							type: r.SettingsType.BOOLEAN,
							default: R.default.isCI,
						},
					},
					hooks: {
						afterAllInstalled: async (n) => {
							let e = n.configuration.get('gitHooksPath'),
								E = n.configuration.get('disableGitHooks'),
								s = Boolean(n.cwd?.endsWith(`dlx-${o.default.pid}`));
							if (e && !R.default.isCI && !s && !E)
								return r.execUtils.pipevp('git', ['config', 'core.hooksPath', e], {
									cwd: n.cwd,
									strict: !0,
									stdin: o.default.stdin,
									stdout: o.default.stdout,
									stderr: o.default.stderr,
								});
						},
					},
				},
				O = N;
			return v(d);
		})();
		return plugin;
	},
};
