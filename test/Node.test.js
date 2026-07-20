import assert from "node:assert/strict";
import { describe, it } from "node:test";

import Node from "../src/Node.js";

// Colors, mirrored from src/Node.js
const GREEN = 0;
const ORANGE = 1;
const RED = 2;

function makeNode(parent, name, version, latestVersion = version, size = 0) {
	const node = new Node(parent, name, version, latestVersion, size, false);
	parent?.children.push(node);
	return node;
}

describe("getParents", () => {
	it("lists the chain from the root down to itself", () => {
		const root = makeNode(null, "root", "1.0.0");
		const a = makeNode(root, "a", "1.0.0");
		const b = makeNode(a, "b", "2.0.0");

		assert.deepEqual(b.getParents(), ["root@1.0.0", "a@1.0.0", "b@2.0.0"]);
		assert.deepEqual(root.getParents(), ["root@1.0.0"]);
	});
});

describe("isCircularDependency", () => {
	const root = makeNode(null, "root", "1.0.0");
	const a = makeNode(root, "a", "1.0.0");
	const b = makeNode(a, "b", "2.0.0");

	it("matches itself", () => {
		assert.equal(b.isCircularDependency("b", "2.0.0"), true);
	});

	it("matches an ancestor", () => {
		assert.equal(b.isCircularDependency("a", "1.0.0"), true);
		assert.equal(b.isCircularDependency("root", "1.0.0"), true);
	});

	it("is version-sensitive", () => {
		assert.equal(b.isCircularDependency("a", "9.9.9"), false);
	});

	it("does not look downwards", () => {
		assert.equal(root.isCircularDependency("b", "2.0.0"), false);
	});
});

describe("isPeerDependency", () => {
	const root = makeNode(null, "root", "1.0.0");
	const a = makeNode(root, "a", "1.0.0");
	const b = makeNode(a, "b", "2.0.0");

	it("matches its own children", () => {
		assert.equal(a.isPeerDependency("b", "2.0.0"), true);
	});

	it("matches a sibling found further up the chain", () => {
		// b has no children, but its grandparent root has `a` as a child
		assert.equal(b.isPeerDependency("a", "1.0.0"), true);
	});

	it("does not match nodes deeper than the ancestor chain's children", () => {
		assert.equal(root.isPeerDependency("b", "2.0.0"), false);
	});
});

describe("getSize", () => {
	it("sums itself and its descendants", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "1.0.0", 100);
		makeNode(a, "b", "2.0.0", "2.0.0", 50);

		assert.equal(root.getSize(), 150);
		assert.equal(a.getSize(), 150);
	});

	it("counts a null size as zero", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", null);
		makeNode(root, "a", "1.0.0", "1.0.0", 100);

		assert.equal(root.getSize(), 100);
	});

	it("does not count a circular dependency twice", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "1.0.0", 100);
		const b = makeNode(a, "b", "2.0.0", "2.0.0", 50);
		// b depends back on a — already counted higher up
		makeNode(b, "a", "1.0.0", "1.0.0", 100);

		assert.equal(b.getSize(), 50);
		assert.equal(root.getSize(), 150);
	});

	it("does not count a dependency already hoisted onto a parent", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "1.0.0", 100);
		makeNode(a, "b", "2.0.0", "2.0.0", 50);
		const c = makeNode(a, "c", "1.0.0", "1.0.0", 30);
		// c also depends on b@2.0.0, which is already a sibling of c
		makeNode(c, "b", "2.0.0", "2.0.0", 50);

		assert.equal(c.getSize(), 30);
		assert.equal(root.getSize(), 180);
	});
});

describe("toArray", () => {
	it("serializes name, version, size and children", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		makeNode(root, "a", "1.0.0", "1.0.0", 1024);

		const result = root.toArray();

		assert.equal(result.name, "root@1.0.0");
		assert.equal(result.version, "1.0.0");
		assert.equal(result.latest, "1.0.0");
		assert.equal(result.size, 1024);
		assert.equal(result.sizeF, "1.02 kB");
		assert.equal(result.children.length, 1);
		assert.equal(result.children[0].name, "a@1.0.0");
	});

	it("reports the same size getSize() computes", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "1.0.0", 100);
		makeNode(a, "b", "2.0.0", "2.0.0", 50);
		const c = makeNode(a, "c", "1.0.0", "1.0.0", 30);
		makeNode(c, "b", "2.0.0", "2.0.0", 50);

		// The peer-dependency cut is applied by getSize() over the *unfiltered*
		// children, and by toArray() when filtering them — the two must agree.
		assert.equal(root.toArray().size, root.getSize());
		assert.equal(a.toArray().size, a.getSize());
	});

	it("uses the child count as the value, falling back to 1 for leaves", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		makeNode(root, "a", "1.0.0", "1.0.0", 0);
		makeNode(root, "b", "1.0.0", "1.0.0", 0);

		const result = root.toArray();
		assert.equal(result.value, 2);
		assert.equal(result.children[0].value, 1);
	});

	it("omits children already hoisted onto a parent", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "1.0.0", 100);
		makeNode(a, "b", "2.0.0", "2.0.0", 50);
		const c = makeNode(a, "c", "1.0.0", "1.0.0", 30);
		makeNode(c, "b", "2.0.0", "2.0.0", 50);

		const result = root.toArray();
		const serializedC = result.children[0].children.find(
			(node) => node.name === "c@1.0.0",
		);

		assert.deepEqual(serializedC.children, []);
	});

	it("keeps every child of the root, which has no parent to hoist onto", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		makeNode(root, "a", "1.0.0", "1.0.0", 0);
		makeNode(root, "b", "1.0.0", "1.0.0", 0);

		assert.equal(root.toArray().children.length, 2);
	});
});

describe("toArray colors", () => {
	it("is green when up to date", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);

		assert.equal(root.toArray().color, GREEN);
	});

	it("is red when the current version is not the latest", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "2.0.0", 0);

		assert.equal(a.toArray().color, RED);
	});

	it("is orange when a direct child is red", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "1.0.0", 0);
		makeNode(a, "b", "1.0.0", "2.0.0", 0);

		assert.equal(a.toArray().color, ORANGE);
	});

	it("does not propagate orange more than one level up", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "1.0.0", 0);
		makeNode(a, "b", "1.0.0", "2.0.0", 0);

		// root's only child is orange, not red, so root stays green
		assert.equal(root.toArray().color, GREEN);
	});

	it("prefers red over orange when the node is itself outdated", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "2.0.0", 0);
		makeNode(a, "b", "1.0.0", "2.0.0", 0);

		assert.equal(a.toArray().color, RED);
	});

	// Current behaviour, not necessarily desirable: getLatestVersion() returns
	// null when the registry lookup fails, which renders identically to a
	// genuinely outdated package. Tracked separately.
	it("renders an unknown latest version as red", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", null, 0);

		assert.equal(a.toArray().color, RED);
	});
});
