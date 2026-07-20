import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createCache } from "cache-manager";
import { DiskStore } from "cache-manager-fs-hash";

import { cacheDirectory, LATEST_VERSION_TTL, SIZE_TTL } from "../src/cache.js";

const directory = mkdtempSync(path.join(tmpdir(), "outdated-cache-"));
after(() => rmSync(directory, { recursive: true, force: true }));

let counter = 0;
function makeCache() {
	const cachePath = path.join(directory, `cache-${counter++}`);
	return {
		cachePath,
		cache: createCache(new DiskStore({ path: cachePath })),
	};
}

// These exercise the real store on the real filesystem rather than mocking it.
// The library is well tested on its own; what this guards is that the stack
// actually works on the Node version CI happens to be running — the previous
// cache library passed every unit test while being broken on Node 23+.
describe("disk cache", () => {
	it("round-trips a value", async () => {
		const { cache } = makeCache();
		await cache.set("latestVersion:a", "4.0.8", LATEST_VERSION_TTL);

		assert.equal(await cache.get("latestVersion:a"), "4.0.8");
	});

	it("returns undefined for an unknown key", async () => {
		const { cache } = makeCache();

		assert.equal(await cache.get("nope"), undefined);
	});

	it("preserves a zero-byte size as a number", async () => {
		const { cache } = makeCache();
		await cache.set("size:a:1.0.0", 0, SIZE_TTL);

		// Distinguishable from a miss, which is what lets registry.js cache it
		assert.equal(await cache.get("size:a:1.0.0"), 0);
		assert.notEqual(await cache.get("size:a:1.0.0"), undefined);
	});

	it("expires entries once their ttl has elapsed", async () => {
		const { cache } = makeCache();
		await cache.set("short", "value", 50);

		await new Promise((resolve) => setTimeout(resolve, 120));
		assert.equal(await cache.get("short"), undefined);
	});

	it("persists across instances sharing a directory", async () => {
		const { cache, cachePath } = makeCache();
		await cache.set("latestVersion:a", "4.0.8", LATEST_VERSION_TTL);

		const reopened = createCache(new DiskStore({ path: cachePath }));
		assert.equal(await reopened.get("latestVersion:a"), "4.0.8");
	});

	it("clears every entry and leaves no files behind", async () => {
		const { cache, cachePath } = makeCache();
		await cache.set("latestVersion:a", "4.0.8", LATEST_VERSION_TTL);
		await cache.set("size:a:1.0.0", 123, SIZE_TTL);

		await cache.clear();

		assert.equal(await cache.get("latestVersion:a"), undefined);
		assert.deepEqual(readdirSync(cachePath), []);
	});
});

describe("cacheDirectory", () => {
	it("uses Library/Caches on macOS", () => {
		assert.equal(
			cacheDirectory({ platform: "darwin", env: {}, homedir: "/Users/me" }),
			"/Users/me/Library/Caches/outdated-dependencies",
		);
	});

	it("honours XDG_CACHE_HOME on Linux", () => {
		assert.equal(
			cacheDirectory({
				platform: "linux",
				env: { XDG_CACHE_HOME: "/custom/cache" },
				homedir: "/home/me",
			}),
			"/custom/cache/outdated-dependencies",
		);
	});

	it("falls back to ~/.cache on Linux", () => {
		assert.equal(
			cacheDirectory({ platform: "linux", env: {}, homedir: "/home/me" }),
			"/home/me/.cache/outdated-dependencies",
		);
	});

	it("uses LOCALAPPDATA on Windows", () => {
		assert.equal(
			cacheDirectory({
				platform: "win32",
				env: { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
				homedir: "C:\\Users\\me",
			}),
			path.join(
				"C:\\Users\\me\\AppData\\Local",
				"outdated-dependencies",
				"Cache",
			),
		);
	});

	it("never points inside the installed package", () => {
		const resolved = cacheDirectory();
		const packageRoot = fileURLToPath(new URL("..", import.meta.url));

		assert.ok(!resolved.startsWith(packageRoot));
	});
});
