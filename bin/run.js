#!/usr/bin/env node

import { execute } from '@oclif/core';

import { error } from '../dist/lib/outputs.js';

try {
    await execute({ development: false, dir: import.meta.url });
} catch (err) {
    const exitCode = (err.oclif && err.oclif.exit !== undefined) ? err.oclif.exit : 1;
    if (exitCode !== 0) {
        error(err.message);
        if (process.env.DEBUG) console.error(err);
        process.exit(exitCode);
    }
}
