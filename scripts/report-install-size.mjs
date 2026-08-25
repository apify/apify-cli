/*
Measures the npm install footprint of the package about to be released and compares it with the
latest version published to npm. Prints a markdown table that the release workflows embed in the
GitHub release notes (via the `report` output) and in the job summary.

Metrics (same as apify/mcpc):
- Tarball download: size of the packed .tgz
- Unpacked package: size of the package directory inside node_modules
- Full install (with dependencies): size of the whole node_modules after `npm install`

Run locally with `node scripts/report-install-size.mjs` (requires dependencies to be installed,
because packing runs the prepack build).
*/

import { execSync } from 'node:child_process';
import {
    appendFileSync,
    lstatSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const repoRoot = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
const packageName = pkg.name;

const GROWTH_WARNING_RATIO = 0.2;
const GROWTH_WARNING_BYTES = 1024 * 1024;

function dirSize(path) {
    let total = 0;

    for (const entry of readdirSync(path, { withFileTypes: true })) {
        const entryPath = join(path, entry.name);
        const stats = lstatSync(entryPath);

        if (stats.isSymbolicLink()) continue;

        if (stats.isDirectory()) {
            total += dirSize(entryPath);
        } else {
            total += stats.size;
        }
    }

    return total;
}

function formatMB(bytes) {
    if (bytes === null) return 'n/a';
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatChange(current, previous) {
    if (previous === null || previous === 0) return 'n/a';
    const ratio = (current - previous) / previous;
    const sign = ratio >= 0 ? '+' : '';
    return `${sign}${(ratio * 100).toFixed(1)}%`;
}

function installTarball(spec) {
    const dir = mkdtempSync(join(tmpdir(), 'apify-cli-install-size-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'install-size-probe', private: true }));

    execSync(`npm install ${JSON.stringify(spec)} --no-audit --no-fund --loglevel=error`, {
        cwd: dir,
        stdio: ['ignore', 'inherit', 'inherit'],
    });

    return {
        dir,
        unpackedBytes: dirSize(join(dir, 'node_modules', packageName)),
        fullInstallBytes: dirSize(join(dir, 'node_modules')),
    };
}

// #region Measure the local build

console.error(`Packing ${packageName}@${pkg.version}...`);

const packDir = mkdtempSync(join(tmpdir(), 'apify-cli-pack-'));
const localTarball = join(packDir, 'package.tgz');

execSync(`pnpm pack --out ${JSON.stringify(localTarball)}`, { cwd: repoRoot, stdio: ['ignore', 'inherit', 'inherit'] });

const local = {
    tarballBytes: statSync(localTarball).size,
    ...installTarball(localTarball),
};

// #endregion

// #region Measure the latest published version

let latest = null;
let latestVersion = null;

try {
    latestVersion = JSON.parse(execSync(`npm view ${packageName}@latest version --json`, { encoding: 'utf-8' }));
    const tarballUrl = JSON.parse(
        execSync(`npm view ${packageName}@latest dist.tarball --json`, { encoding: 'utf-8' }),
    );

    console.error(`Comparing with ${packageName}@${latestVersion}...`);

    // Download the tarball to measure its real byte size (Content-Length is not always present).
    const response = await fetch(tarballUrl);
    if (!response.ok) throw new Error(`Failed to download ${tarballUrl}: HTTP ${response.status}`);
    const tarballBytes = (await response.arrayBuffer()).byteLength;

    latest = {
        tarballBytes,
        ...installTarball(`${packageName}@${latestVersion}`),
    };
} catch (error) {
    console.error(`Could not measure the latest published version, skipping comparison: ${error.message}`);
}

// #endregion

const latestLabel = latestVersion ? `Latest (${latestVersion})` : 'Latest';

const rows = [
    ['Tarball download', local.tarballBytes, latest?.tarballBytes ?? null],
    ['Unpacked package', local.unpackedBytes, latest?.unpackedBytes ?? null],
    ['Full install (with dependencies)', local.fullInstallBytes, latest?.fullInstallBytes ?? null],
];

const report = [
    '### Install size',
    '',
    `| Metric | This release | ${latestLabel} | Change |`,
    '| --- | --- | --- | --- |',
    ...rows.map(
        ([metric, current, previous]) =>
            `| ${metric} | ${formatMB(current)} | ${formatMB(previous)} | ${formatChange(current, previous)} |`,
    ),
].join('\n');

console.log(report);

for (const [metric, current, previous] of rows) {
    if (previous === null) continue;
    const growth = current - previous;

    if (growth > GROWTH_WARNING_BYTES && growth / previous > GROWTH_WARNING_RATIO) {
        const message = `${metric} grew from ${formatMB(previous)} to ${formatMB(current)} (${formatChange(current, previous)})`;
        console.log(process.env.GITHUB_ACTIONS ? `::warning::${message}` : `WARNING: ${message}`);
    }
}

if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
}

if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `report<<INSTALL_SIZE_REPORT_EOF\n${report}\nINSTALL_SIZE_REPORT_EOF\n`);
}

rmSync(packDir, { recursive: true, force: true });
rmSync(local.dir, { recursive: true, force: true });
if (latest) rmSync(latest.dir, { recursive: true, force: true });
