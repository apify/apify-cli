#!/usr/bin/env node_modules/.bin/tsx

import { execute } from '@oclif/core';

import { error } from '../src/lib/outputs.js';

try {
    await execute({ development: true, dir: import.meta.url });
} catch (err) {
    const exitCode = (err.oclif && err.oclif.exit !== undefined) ? err.oclif.exit : 1;
    if (exitCode !== 0) {
        error(err.message);
        if (process.env.DEBUG) console.error(err);
        process.exit(exitCode);
    }
}
