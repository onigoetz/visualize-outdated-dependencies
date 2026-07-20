import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { parseLockfile } from "../src/lockfile.js";
import TreeMaker from "../src/TreeMaker.js";

function loadFixture(name) {
	const contents = readFileSync(
		new URL(`./fixtures/${name}/yarn.lock`, import.meta.url),
		"utf8",
	);
	return parseLockfile(contents);
}

// Every fixture exists in both lockfile formats, and both must produce the
// exact same tree — that equivalence is what proves the Berry normalization.
const FORMATS = [
	{ label: "yarn classic", prefix: "" },
	{ label: "yarn berry", prefix: "berry-" },
];

/** Collapses a Node tree into `{ "name@version": { ...children } }` for assertions. */
function shape(node) {
	return Object.fromEntries(
		node.children.map((child) => [
			`${child.name}@${child.version}`,
			shape(child),
		]),
	);
}

const latestVersions = {
	a: "1.0.0",
	b: "2.0.0",
	c: "1.0.0",
	d: "3.0.0",
};

const sizes = {
	"a@1.0.0": 10,
	"b@2.0.0": 20,
	"c@1.0.0": 30,
	"d@3.0.0": 40,
};

function makeMaker(fixture, options = {}) {
	return new TreeMaker(loadFixture(fixture), latestVersions, sizes, options);
}

function makeTree(fixture, rootPackage, options) {
	return makeMaker(fixture, options).getTree(rootPackage);
}

for (const { label, prefix } of FORMATS) {
	describe(`getTree (${label})`, () => {
		it("resolves requested ranges to the locked versions", () => {
			const tree = makeTree(`${prefix}simple`, {
				name: "root",
				version: "1.0.0",
				dependencies: { a: "^1.0.0" },
			});

			assert.equal(tree.name, "root");
			assert.deepEqual(shape(tree), {
				"a@1.0.0": {
					"b@2.0.0": {},
					// c depends on b@2.0.0 too, but it is already a sibling
					"c@1.0.0": {},
				},
			});
		});

		it("includes dev and optional dependencies of the root package", () => {
			const tree = makeTree(`${prefix}simple`, {
				name: "root",
				version: "1.0.0",
				dependencies: { a: "^1.0.0" },
				devDependencies: { d: "^3.0.0" },
			});

			assert.deepEqual(Object.keys(shape(tree)), ["a@1.0.0", "d@3.0.0"]);
		});

		it("carries latest versions and sizes onto the nodes", () => {
			const tree = makeTree(`${prefix}simple`, {
				name: "root",
				version: "1.0.0",
				dependencies: { a: "^1.0.0" },
			});

			const a = tree.children[0];
			assert.equal(a.version, "1.0.0");
			assert.equal(a.latestVersion, "1.0.0");
			assert.equal(a.size, 10);
		});

		it("cuts a circular dependency instead of recursing forever", () => {
			const tree = makeTree(`${prefix}circular`, {
				name: "root",
				version: "1.0.0",
				dependencies: { a: "^1.0.0" },
			});

			assert.deepEqual(shape(tree), {
				"a@1.0.0": {
					// b depends back on a@1.0.0, which is its own ancestor
					"b@2.0.0": {},
				},
			});
		});
	});

	describe(`getTree with yarn workspaces (${label})`, () => {
		const currentDir = fileURLToPath(
			new URL(`./fixtures/${prefix}workspace-repo`, import.meta.url),
		);

		function workspaceTree() {
			const rootPackage = JSON.parse(
				readFileSync(path.join(currentDir, "package.json"), "utf8"),
			);
			return makeTree(`${prefix}workspace-repo`, rootPackage, { currentDir });
		}

		it("attaches every workspace package to the root", () => {
			const tree = workspaceTree();
			const children = Object.keys(shape(tree)).sort();

			assert.deepEqual(children, ["a@1.0.0", "pkg-one@1.0.0", "pkg-two@1.0.0"]);
		});

		it("resolves each workspace package's own dependencies", () => {
			const tree = workspaceTree();
			const pkgOne = tree.children.find((node) => node.name === "pkg-one");

			assert.deepEqual(shape(pkgOne), { "b@2.0.0": {} });
		});

		it("excludes workspace siblings, which are absent from the lockfile", () => {
			const tree = workspaceTree();
			const pkgTwo = tree.children.find((node) => node.name === "pkg-two");

			// pkg-two depends on d and on pkg-one; only d is a real lockfile entry
			assert.deepEqual(shape(pkgTwo), { "d@3.0.0": {} });
		});

		it("resolves workspaces relative to currentDir, not process.cwd()", () => {
			// The test runner's cwd is the repo root, which has no packages/* folders,
			// so this only passes if currentDir is threaded through.
			assert.notEqual(process.cwd(), currentDir);
			assert.equal(Object.keys(shape(workspaceTree())).length, 3);
		});
	});

	describe(`getCurrentVersion (${label})`, () => {
		const maker = makeMaker(`${prefix}simple`);

		it("resolves a range present in the lockfile", () => {
			assert.equal(maker.getCurrentVersion("a", "^1.0.0"), "1.0.0");
		});

		it("returns the requested version verbatim when the lockfile has no entry", () => {
			assert.equal(maker.getCurrentVersion("unknown", "1.2.3"), "1.2.3");
		});

		it("returns no dependencies when the lockfile has no entry", () => {
			assert.deepEqual(maker.getDependencies("unknown", "1.2.3"), {});
		});
	});
}

describe("getLatestVersion / getSize", () => {
	const maker = makeMaker("simple");

	it("looks up known packages", () => {
		assert.equal(maker.getLatestVersion("a"), "1.0.0");
		assert.equal(maker.getSize("a", "1.0.0"), 10);
	});

	it("returns null for unknown packages", () => {
		assert.equal(maker.getLatestVersion("nope"), null);
		assert.equal(maker.getSize("nope", "1.0.0"), null);
	});
});
