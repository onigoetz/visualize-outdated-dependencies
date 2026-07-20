import { describe, expect, it } from "vitest";

import { getData } from "../src/index.js";

const lockfileDependencies = {
	"a@^1.0.0": { version: "1.0.0" },
	"b@^2.0.0": { version: "2.0.0" },
	"@scope/c@^3.0.0": { version: "3.0.0" },
};

const registry = {
	getLatestVersion: async (pkg) => `latest-${pkg}`,
	getPackageSize: async (pkg, version) => `${pkg}:${version}`.length,
};

describe("getData", () => {
	it("looks up the latest version of every distinct package", async () => {
		const { latestVersions } = await getData(lockfileDependencies, {
			registry,
		});

		expect(latestVersions).toEqual({
			a: "latest-a",
			b: "latest-b",
			"@scope/c": "latest-@scope/c",
		});
	});

	it("splits scoped names on the last @, not the first", async () => {
		const { sizes } = await getData(lockfileDependencies, { registry });

		// "@scope/c@3.0.0" must resolve to pkg "@scope/c" at version "3.0.0"
		expect(sizes["@scope/c@3.0.0"]).toBe("@scope/c:3.0.0".length);
	});

	it("keys sizes by the locked version rather than the requested range", async () => {
		const { sizes } = await getData(lockfileDependencies, { registry });

		expect(Object.keys(sizes).sort()).toEqual([
			"@scope/c@3.0.0",
			"a@1.0.0",
			"b@2.0.0",
		]);
	});

	it("reports progress up to the total number of lookups", async () => {
		const calls = [];
		await getData(lockfileDependencies, {
			registry,
			onProgress: (done, total) => calls.push([done, total]),
		});

		// 3 packages + 3 sizes
		expect(calls.at(0)).toEqual([0, 6]);
		expect(calls.at(-1)).toEqual([6, 6]);
		expect(calls).toHaveLength(7);
	});

	it("handles an empty lockfile", async () => {
		const { latestVersions, sizes } = await getData({}, { registry });

		expect(latestVersions).toEqual({});
		expect(sizes).toEqual({});
	});
});
