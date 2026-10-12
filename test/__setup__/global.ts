/**
 * Runs before every test file.
 *
 * The keyring is the one store a test cannot sandbox. `__APIFY_INTERNAL_TEST_AUTH_PATH__` moves
 * `auth.json` somewhere scratch, but the OS keyring is per-user, and `clearKeyringSecrets()`
 * deletes the fixed names whatever the backend is — so one `logout` in a test reaches the
 * developer's own stored login. Mocking it here rather than per file means a new test cannot
 * forget.
 */
vi.mock('@napi-rs/keyring', () => import('./keyring-mock.js'));
