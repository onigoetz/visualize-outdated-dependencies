import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseClassic } from "@yarnpkg/lockfile";
import { parse as parseYaml } from "yaml";

/**
 * Splits a `name@range` descriptor at the first `@` after the scope prefix.
 *
 * Splitting on the last `@` instead breaks on aliases, where the range itself
 * contains one: `string-width-cjs@npm:string-width@^4.2.0`.
 */
export function splitDescriptor(descriptor) {
	const separator = descriptor.indexOf("@", descriptor.startsWith("@") ? 1 : 0);

	if (separator < 0) {
		return { name: descriptor, range: "" };
	}

	return {
		name: descriptor.substring(0, separator),
		range: descriptor.substring(separator + 1),
	};
}

/**
 * Drops the `npm:` protocol so Berry ranges match what `package.json` declares.
 * Other protocols (`patch:`, `portal:`, `link:`, git URLs) are left verbatim.
 */
function stripNpmProtocol(range) {
	return range.startsWith("npm:") ? range.substring(4) : range;
}

function normalizeDependencies(dependencies) {
	if (!dependencies) {
		return undefined;
	}

	return Object.fromEntries(
		Object.entries(dependencies).map(([name, range]) => [
			name,
			stripNpmProtocol(range),
		]),
	);
}

/**
 * Yarn Berry (2/3/4) lockfiles are YAML, keyed by one or more comma-separated
 * descriptors carrying a protocol. Normalizes them to the Yarn Classic shape:
 * a flat map of `name@range` to `{ version, dependencies }`.
 */
export function parseBerryLockfile(contents) {
	const parsed = parseYaml(contents) || {};
	const dependencies = {};

	for (const [key, entry] of Object.entries(parsed)) {
		if (key === "__metadata") {
			continue;
		}

		// Workspaces aren't real packages: TreeMaker builds them from package.json
		// and skips them by name, and their `0.0.0-use.local` version isn't on the
		// registry.
		if (entry.linkType === "soft") {
			continue;
		}

		const normalized = {
			version: entry.version,
			dependencies: normalizeDependencies(entry.dependencies),
		};

		for (const descriptor of key.split(", ")) {
			const { name, range } = splitDescriptor(descriptor);
			dependencies[`${name}@${stripNpmProtocol(range)}`] = normalized;
		}
	}

	return dependencies;
}

export function parseClassicLockfile(contents) {
	return parseClassic(contents).object;
}

/** Detects the lockfile format and parses it into the Yarn Classic shape. */
export function parseLockfile(contents) {
	// Berry always writes this header; Classic never does.
	return /^__metadata:/m.test(contents)
		? parseBerryLockfile(contents)
		: parseClassicLockfile(contents);
}

export async function readLockfile(currentDir) {
	return parseLockfile(
		await fs.readFile(path.join(currentDir, "yarn.lock"), "utf8"),
	);
}
