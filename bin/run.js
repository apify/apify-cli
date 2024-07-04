#!/usr/bin/env node

import { execute } from '@oclif/core';
import { satisfies } from 'semver';

import { SUPPORTED_NODEJS_VERSION } from '../dist/lib/consts.js';
import { error } from '../dist/lib/outputs.js';

if (!satisfies(process.version, SUPPORTED_NODEJS_VERSION)) {
    error({ message: `Apify CLI requires Node.js version ${SUPPORTED_NODEJS_VERSION}. Your current version is ${process.version}.` });
    process.exit(1);
}

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
