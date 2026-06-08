// Fixture for the run exit-code propagation test.
// See https://github.com/apify/apify-cli/issues/1180 and https://github.com/apify/apify-cli/issues/1190
// A failing Actor: `npm start` exits with a non-zero code that the CLI must
// propagate instead of swallowing.
process.exit(10);
