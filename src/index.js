import fs from "node:fs/promises";
import path from "node:path";
import cliProgress from "cli-progress";
import open from "open";
import tmp from "tmp";
import { readLockfile, splitDescriptor } from "./lockfile.js";
import { createRegistry } from "./registry.js";
import { renderReport } from "./report.js";
import TreeMaker from "./TreeMaker.js";

const TEMPLATE = new URL("./template.html", import.meta.url);

export async function getData(
	lockfileDependencies,
	{ registry = createRegistry(), onProgress = () => {} } = {},
) {
	const latestVersions = {};
	const sizes = {};
	for (const key of Object.keys(lockfileDependencies)) {
		const { name: pack } = splitDescriptor(key);
		latestVersions[pack] = null;
		sizes[`${pack}@${lockfileDependencies[key].version}`] = null;
	}

	const latestVersionPackageList = Object.keys(latestVersions);
	const sizePackageList = Object.keys(sizes);

	const total = latestVersionPackageList.length + sizePackageList.length;
	let done = 0;
	onProgress(done, total);

	const tick = () => {
		done++;
		onProgress(done, total);
	};

	await Promise.all([
		...latestVersionPackageList.map(async (pack) => {
			latestVersions[pack] = await registry.getLatestVersion(pack);
			tick();
		}),
		...sizePackageList.map(async (key) => {
			const { name: pkg, range: version } = splitDescriptor(key);

			sizes[key] = await registry.getPackageSize(pkg, version);
			tick();
		}),
	]);

	return { latestVersions, sizes };
}

/** Drives getData's progress callback from a terminal progress bar. */
function progressBarReporter() {
	const bar = new cliProgress.Bar({}, cliProgress.Presets.shades_classic);
	let started = false;

	return {
		onProgress(done, total) {
			if (started) {
				bar.update(done);
				return;
			}

			bar.start(total, done);
			started = true;
		},
		stop: () => bar.stop(),
	};
}

export async function run(currentDir, { verbose, shouldOpen = true }) {
	const lockfileDependencies = await readLockfile(currentDir);

	console.log("Getting latest Versions...");
	const reporter = progressBarReporter();
	let latestVersions;
	let sizes;
	try {
		({ latestVersions, sizes } = await getData(lockfileDependencies, {
			onProgress: reporter.onProgress,
		}));
	} finally {
		reporter.stop();
	}

	const rootPackage = JSON.parse(
		await fs.readFile(path.join(currentDir, "package.json"), "utf8"),
	);

	const tree = new TreeMaker(lockfileDependencies, latestVersions, sizes, {
		verbose,
		currentDir,
	}).getTree(rootPackage);

	const report = renderReport(
		tree.toArray(),
		await fs.readFile(TEMPLATE, "utf8"),
	);

	const tempFile = tmp.fileSync({ postfix: ".html" });
	await fs.writeFile(tempFile.name, report);

	console.log("Written report to", tempFile.name);

	if (shouldOpen) {
		try {
			await open(tempFile.name, { wait: false });
			return;
		} catch (error) {
			console.error(`Unable to open web browser: ${error}`);
		}
	}

	console.error("View HTML for the visualization at:");
	console.error(tempFile.name);
}
