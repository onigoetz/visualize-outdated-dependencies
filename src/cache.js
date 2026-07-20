import os from "node:os";
import path from "node:path";
import { createCache } from "cache-manager";
import { DiskStore } from "cache-manager-fs-hash";

const APP_NAME = "outdated-dependencies";

const HOUR = 60 * 60 * 1000;

export const LATEST_VERSION_TTL = HOUR * 6;
export const SIZE_TTL = HOUR * 24;

/**
 * Per-user cache directory for the current platform.
 *
 * Deliberately outside the package's own directory: a globally installed CLI
 * lives in a location that may be read-only, and is wiped on every upgrade.
 */
export function cacheDirectory({
	platform = process.platform,
	env = process.env,
	homedir = os.homedir(),
} = {}) {
	if (platform === "win32") {
		return path.join(
			env.LOCALAPPDATA || path.join(homedir, "AppData", "Local"),
			APP_NAME,
			"Cache",
		);
	}

	if (platform === "darwin") {
		return path.join(homedir, "Library", "Caches", APP_NAME);
	}

	return path.join(
		env.XDG_CACHE_HOME || path.join(homedir, ".cache"),
		APP_NAME,
	);
}

// Created on first use rather than at import time, so importing this module
// (or anything depending on it) has no filesystem side effects.
let cache;

export function getCache() {
	if (!cache) {
		cache = createCache(new DiskStore({ path: cacheDirectory() }));
	}

	return cache;
}

export function clearCaches() {
	return getCache().clear();
}
