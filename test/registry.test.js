import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { createCache } from "cache-manager";

import { createRegistry } from "../src/registry.js";

/** A packument shaped like the subset npm-pick-manifest needs. */
function packument(name, versions) {
	return {
		name,
		"dist-tags": { latest: Object.keys(versions).at(-1) },
		versions: Object.fromEntries(
			Object.entries(versions).map(([version, dist]) => [
				version,
				{ name, version, dist },
			]),
		),
	};
}

function makeRegistry(fetchPackument) {
	// cache-manager's default store is in-memory, so this is the real cache
	// implementation with the real async interface, minus the disk.
	return createRegistry({ fetchPackument, cache: createCache() });
}

describe("getLatestVersion", () => {
	it("resolves the latest dist-tag", async () => {
		const registry = makeRegistry(async () =>
			packument("a", { "1.0.0": {}, "2.0.0": {} }),
		);

		assert.equal(await registry.getLatestVersion("a"), "2.0.0");
	});

	it("only fetches a package once", async () => {
		const fetchPackument = mock.fn(async () => packument("a", { "1.0.0": {} }));
		const registry = makeRegistry(fetchPackument);

		await registry.getLatestVersion("a");
		await registry.getLatestVersion("a");

		assert.equal(fetchPackument.mock.callCount(), 1);
	});

	it("returns null when the lookup fails", async () => {
		const consoleError = mock.method(console, "error", () => {});
		const registry = makeRegistry(async () => {
			throw new Error("ENOTFOUND");
		});

		assert.equal(await registry.getLatestVersion("nope"), null);
		assert.equal(consoleError.mock.callCount(), 1);
		consoleError.mock.restore();
	});

	it("does not cache a failed lookup", async () => {
		const consoleError = mock.method(console, "error", () => {});
		let attempt = 0;
		const registry = makeRegistry(async () => {
			attempt++;
			if (attempt === 1) {
				throw new Error("ENOTFOUND");
			}
			return packument("a", { "1.0.0": {} });
		});

		assert.equal(await registry.getLatestVersion("a"), null);
		assert.equal(await registry.getLatestVersion("a"), "1.0.0");
		consoleError.mock.restore();
	});
});

describe("getPackageSize", () => {
	it("reads unpackedSize from the requested version's manifest", async () => {
		const registry = makeRegistry(async () =>
			packument("a", {
				"1.0.0": { unpackedSize: 111 },
				"2.0.0": { unpackedSize: 222 },
			}),
		);

		assert.equal(await registry.getPackageSize("a", "1.0.0"), 111);
	});

	it("caches per package and version", async () => {
		const fetchPackument = mock.fn(async () =>
			packument("a", {
				"1.0.0": { unpackedSize: 111 },
				"2.0.0": { unpackedSize: 222 },
			}),
		);
		const registry = makeRegistry(fetchPackument);

		await registry.getPackageSize("a", "1.0.0");
		await registry.getPackageSize("a", "1.0.0");
		assert.equal(fetchPackument.mock.callCount(), 1);

		await registry.getPackageSize("a", "2.0.0");
		assert.equal(fetchPackument.mock.callCount(), 2);
	});

	it("returns 0 when the lookup fails", async () => {
		const consoleError = mock.method(console, "error", () => {});
		const registry = makeRegistry(async () => {
			throw new Error("ENOTFOUND");
		});

		assert.equal(await registry.getPackageSize("nope", "1.0.0"), 0);
		consoleError.mock.restore();
	});

	// A miss is undefined rather than falsy, so a package that genuinely
	// reports 0 bytes is cached like any other.
	it("caches a package whose size is zero", async () => {
		const fetchPackument = mock.fn(async () =>
			packument("a", { "1.0.0": { unpackedSize: 0 } }),
		);
		const registry = makeRegistry(fetchPackument);

		assert.equal(await registry.getPackageSize("a", "1.0.0"), 0);
		assert.equal(await registry.getPackageSize("a", "1.0.0"), 0);

		assert.equal(fetchPackument.mock.callCount(), 1);
	});
});
