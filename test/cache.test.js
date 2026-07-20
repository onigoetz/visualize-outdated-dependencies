import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCache } from "cache-manager";
import { DiskStore } from "cache-manager-fs-hash";
import { afterAll, describe, expect, it } from "vitest";

import { cacheDirectory, LATEST_VERSION_TTL, SIZE_TTL } from "../src/cache.js";

const directory = mkdtempSync(path.join(tmpdir(), "outdated-cache-"));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

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

		expect(await cache.get("latestVersion:a")).toBe("4.0.8");
	});

	it("returns undefined for an unknown key", async () => {
		const { cache } = makeCache();

		expect(await cache.get("nope")).toBeUndefined();
	});

	it("preserves a zero-byte size as a number", async () => {
		const { cache } = makeCache();
		await cache.set("size:a:1.0.0", 0, SIZE_TTL);

		// Distinguishable from a miss, which is what lets registry.js cache it
		expect(await cache.get("size:a:1.0.0")).toBe(0);
		expect(await cache.get("size:a:1.0.0")).not.toBeUndefined();
	});

	it("expires entries once their ttl has elapsed", async () => {
		const { cache } = makeCache();
		await cache.set("short", "value", 50);

		await new Promise((resolve) => setTimeout(resolve, 120));
		expect(await cache.get("short")).toBeUndefined();
	});

	it("persists across instances sharing a directory", async () => {
		const { cache, cachePath } = makeCache();
		await cache.set("latestVersion:a", "4.0.8", LATEST_VERSION_TTL);

		const reopened = createCache(new DiskStore({ path: cachePath }));
		expect(await reopened.get("latestVersion:a")).toBe("4.0.8");
	});

	it("clears every entry and leaves no files behind", async () => {
		const { cache, cachePath } = makeCache();
		await cache.set("latestVersion:a", "4.0.8", LATEST_VERSION_TTL);
		await cache.set("size:a:1.0.0", 123, SIZE_TTL);

		await cache.clear();

		expect(await cache.get("latestVersion:a")).toBeUndefined();
		expect(readdirSync(cachePath)).toEqual([]);
	});
});

describe("cacheDirectory", () => {
	it("uses Library/Caches on macOS", () => {
		expect(
			cacheDirectory({ platform: "darwin", env: {}, homedir: "/Users/me" }),
		).toBe("/Users/me/Library/Caches/outdated-dependencies");
	});

	it("honours XDG_CACHE_HOME on Linux", () => {
		expect(
			cacheDirectory({
				platform: "linux",
				env: { XDG_CACHE_HOME: "/custom/cache" },
				homedir: "/home/me",
			}),
		).toBe("/custom/cache/outdated-dependencies");
	});

	it("falls back to ~/.cache on Linux", () => {
		expect(
			cacheDirectory({ platform: "linux", env: {}, homedir: "/home/me" }),
		).toBe("/home/me/.cache/outdated-dependencies");
	});

	it("uses LOCALAPPDATA on Windows", () => {
		expect(
			cacheDirectory({
				platform: "win32",
				env: { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
				homedir: "C:\\Users\\me",
			}),
		).toBe(
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

		expect(resolved.startsWith(packageRoot)).toBe(false);
	});
});
