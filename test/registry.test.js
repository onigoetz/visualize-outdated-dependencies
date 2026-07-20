import { createCache } from "cache-manager";
import { describe, expect, it, vi } from "vitest";

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

		expect(await registry.getLatestVersion("a")).toBe("2.0.0");
	});

	it("only fetches a package once", async () => {
		const fetchPackument = vi.fn(async () => packument("a", { "1.0.0": {} }));
		const registry = makeRegistry(fetchPackument);

		await registry.getLatestVersion("a");
		await registry.getLatestVersion("a");

		expect(fetchPackument).toHaveBeenCalledTimes(1);
	});

	it("returns null when the lookup fails", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const registry = makeRegistry(async () => {
			throw new Error("ENOTFOUND");
		});

		expect(await registry.getLatestVersion("nope")).toBeNull();
		expect(consoleError).toHaveBeenCalledTimes(1);
		consoleError.mockRestore();
	});

	it("does not cache a failed lookup", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		let attempt = 0;
		const registry = makeRegistry(async () => {
			attempt++;
			if (attempt === 1) {
				throw new Error("ENOTFOUND");
			}
			return packument("a", { "1.0.0": {} });
		});

		expect(await registry.getLatestVersion("a")).toBeNull();
		expect(await registry.getLatestVersion("a")).toBe("1.0.0");
		consoleError.mockRestore();
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

		expect(await registry.getPackageSize("a", "1.0.0")).toBe(111);
	});

	it("caches per package and version", async () => {
		const fetchPackument = vi.fn(async () =>
			packument("a", {
				"1.0.0": { unpackedSize: 111 },
				"2.0.0": { unpackedSize: 222 },
			}),
		);
		const registry = makeRegistry(fetchPackument);

		await registry.getPackageSize("a", "1.0.0");
		await registry.getPackageSize("a", "1.0.0");
		expect(fetchPackument).toHaveBeenCalledTimes(1);

		await registry.getPackageSize("a", "2.0.0");
		expect(fetchPackument).toHaveBeenCalledTimes(2);
	});

	it("returns 0 when the lookup fails", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const registry = makeRegistry(async () => {
			throw new Error("ENOTFOUND");
		});

		expect(await registry.getPackageSize("nope", "1.0.0")).toBe(0);
		consoleError.mockRestore();
	});

	// A miss is undefined rather than falsy, so a package that genuinely
	// reports 0 bytes is cached like any other.
	it("caches a package whose size is zero", async () => {
		const fetchPackument = vi.fn(async () =>
			packument("a", { "1.0.0": { unpackedSize: 0 } }),
		);
		const registry = makeRegistry(fetchPackument);

		expect(await registry.getPackageSize("a", "1.0.0")).toBe(0);
		expect(await registry.getPackageSize("a", "1.0.0")).toBe(0);

		expect(fetchPackument).toHaveBeenCalledTimes(1);
	});
});
