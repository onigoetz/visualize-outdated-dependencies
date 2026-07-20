import pickManifest from "npm-pick-manifest";
import npmFetch from "npm-registry-fetch";

import { getCache, LATEST_VERSION_TTL, SIZE_TTL } from "./cache.js";

/**
 * Registry lookups, with the cache and HTTP client injectable so callers (and
 * tests) can substitute them. The defaults are resolved when this is called,
 * not when the module is imported.
 */
export function createRegistry({
	fetchPackument = (pkg) => npmFetch.json(`/${pkg}`),
	cache = getCache(),
} = {}) {
	async function getManifest(pkg, version) {
		return pickManifest(await fetchPackument(pkg), version);
	}

	return {
		async getLatestVersion(pkg) {
			const key = `latestVersion:${pkg}`;
			const cached = await cache.get(key);
			if (cached !== undefined) {
				return cached;
			}

			try {
				const { version } = await getManifest(pkg, "latest");
				await cache.set(key, version, LATEST_VERSION_TTL);
				return version;
			} catch (error) {
				console.error(`Could not retrieve manifest for ${pkg}.`, error);
				return null;
			}
		},

		async getPackageSize(pkg, version) {
			const key = `size:${pkg}:${version}`;
			const cached = await cache.get(key);
			if (cached !== undefined) {
				return cached;
			}

			try {
				const { dist } = await getManifest(pkg, version);
				await cache.set(key, dist.unpackedSize, SIZE_TTL);
				return dist.unpackedSize;
			} catch (error) {
				console.error(
					`Could not retrieve manifest for ${pkg}@${version}.`,
					error,
				);
				return 0;
			}
		},
	};
}
