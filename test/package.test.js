import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("published package contents", () => {
	let files;

	before(async () => {
		const { stdout } = await execFileAsync(
			"npm",
			["pack", "--dry-run", "--json"],
			{ cwd: repoRoot },
		);
		files = JSON.parse(stdout)[0].files.map((file) => file.path);
	});

	it("ships every module the CLI loads at runtime", () => {
		for (const file of [
			"src/bin.js",
			"src/cache.js",
			"src/index.js",
			"src/Node.js",
			"src/registry.js",
			"src/report.js",
			"src/TreeMaker.js",
		]) {
			assert.ok(files.includes(file), `${file} is missing from the tarball`);
		}
	});

	it("ships the report template", () => {
		assert.ok(files.includes("src/template.html"));
	});

	it("does not ship local caches or test fixtures", () => {
		assert.deepEqual(
			files.filter(
				(file) => file.endsWith("_cache.json") || file.startsWith("test/"),
			),
			[],
		);
	});
});
