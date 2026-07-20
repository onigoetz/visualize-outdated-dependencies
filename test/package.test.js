import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("published package contents", () => {
	let files;

	beforeAll(async () => {
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
			"src/lockfile.js",
			"src/Node.js",
			"src/registry.js",
			"src/report.js",
			"src/TreeMaker.js",
		]) {
			expect(files, `${file} is missing from the tarball`).toContain(file);
		}
	});

	it("ships the report template", () => {
		expect(files).toContain("src/template.html");
	});

	it("does not ship local caches or test fixtures", () => {
		expect(
			files.filter(
				(file) => file.endsWith("_cache.json") || file.startsWith("test/"),
			),
		).toEqual([]);
	});
});
