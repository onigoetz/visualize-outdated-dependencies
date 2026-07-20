import { describe, expect, it } from "vitest";

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

		expect(b.getParents()).toEqual(["root@1.0.0", "a@1.0.0", "b@2.0.0"]);
		expect(root.getParents()).toEqual(["root@1.0.0"]);
	});
});

describe("isCircularDependency", () => {
	const root = makeNode(null, "root", "1.0.0");
	const a = makeNode(root, "a", "1.0.0");
	const b = makeNode(a, "b", "2.0.0");

	it("matches itself", () => {
		expect(b.isCircularDependency("b", "2.0.0")).toBe(true);
	});

	it("matches an ancestor", () => {
		expect(b.isCircularDependency("a", "1.0.0")).toBe(true);
		expect(b.isCircularDependency("root", "1.0.0")).toBe(true);
	});

	it("is version-sensitive", () => {
		expect(b.isCircularDependency("a", "9.9.9")).toBe(false);
	});

	it("does not look downwards", () => {
		expect(root.isCircularDependency("b", "2.0.0")).toBe(false);
	});
});

describe("isPeerDependency", () => {
	const root = makeNode(null, "root", "1.0.0");
	const a = makeNode(root, "a", "1.0.0");
	const b = makeNode(a, "b", "2.0.0");

	it("matches its own children", () => {
		expect(a.isPeerDependency("b", "2.0.0")).toBe(true);
	});

	it("matches a sibling found further up the chain", () => {
		// b has no children, but its grandparent root has `a` as a child
		expect(b.isPeerDependency("a", "1.0.0")).toBe(true);
	});

	it("does not match nodes deeper than the ancestor chain's children", () => {
		expect(root.isPeerDependency("b", "2.0.0")).toBe(false);
	});
});

describe("getSize", () => {
	it("sums itself and its descendants", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "1.0.0", 100);
		makeNode(a, "b", "2.0.0", "2.0.0", 50);

		expect(root.getSize()).toBe(150);
		expect(a.getSize()).toBe(150);
	});

	it("counts a null size as zero", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", null);
		makeNode(root, "a", "1.0.0", "1.0.0", 100);

		expect(root.getSize()).toBe(100);
	});

	it("does not count a circular dependency twice", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "1.0.0", 100);
		const b = makeNode(a, "b", "2.0.0", "2.0.0", 50);
		// b depends back on a — already counted higher up
		makeNode(b, "a", "1.0.0", "1.0.0", 100);

		expect(b.getSize()).toBe(50);
		expect(root.getSize()).toBe(150);
	});

	it("does not count a dependency already hoisted onto a parent", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "1.0.0", 100);
		makeNode(a, "b", "2.0.0", "2.0.0", 50);
		const c = makeNode(a, "c", "1.0.0", "1.0.0", 30);
		// c also depends on b@2.0.0, which is already a sibling of c
		makeNode(c, "b", "2.0.0", "2.0.0", 50);

		expect(c.getSize()).toBe(30);
		expect(root.getSize()).toBe(180);
	});
});

describe("toArray", () => {
	it("serializes name, version, size and children", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		makeNode(root, "a", "1.0.0", "1.0.0", 1024);

		const result = root.toArray();

		expect(result.name).toBe("root@1.0.0");
		expect(result.version).toBe("1.0.0");
		expect(result.latest).toBe("1.0.0");
		expect(result.size).toBe(1024);
		expect(result.sizeF).toBe("1.02 kB");
		expect(result.children.length).toBe(1);
		expect(result.children[0].name).toBe("a@1.0.0");
	});

	it("reports the same size getSize() computes", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "1.0.0", 100);
		makeNode(a, "b", "2.0.0", "2.0.0", 50);
		const c = makeNode(a, "c", "1.0.0", "1.0.0", 30);
		makeNode(c, "b", "2.0.0", "2.0.0", 50);

		// The peer-dependency cut is applied by getSize() over the *unfiltered*
		// children, and by toArray() when filtering them — the two must agree.
		expect(root.toArray().size).toBe(root.getSize());
		expect(a.toArray().size).toBe(a.getSize());
	});

	it("uses the child count as the value, falling back to 1 for leaves", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		makeNode(root, "a", "1.0.0", "1.0.0", 0);
		makeNode(root, "b", "1.0.0", "1.0.0", 0);

		const result = root.toArray();
		expect(result.value).toBe(2);
		expect(result.children[0].value).toBe(1);
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

		expect(serializedC.children).toEqual([]);
	});

	it("keeps every child of the root, which has no parent to hoist onto", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		makeNode(root, "a", "1.0.0", "1.0.0", 0);
		makeNode(root, "b", "1.0.0", "1.0.0", 0);

		expect(root.toArray().children.length).toBe(2);
	});
});

describe("toArray colors", () => {
	it("is green when up to date", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);

		expect(root.toArray().color).toBe(GREEN);
	});

	it("is red when the current version is not the latest", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "2.0.0", 0);

		expect(a.toArray().color).toBe(RED);
	});

	it("is orange when a direct child is red", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "1.0.0", 0);
		makeNode(a, "b", "1.0.0", "2.0.0", 0);

		expect(a.toArray().color).toBe(ORANGE);
	});

	it("does not propagate orange more than one level up", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "1.0.0", 0);
		makeNode(a, "b", "1.0.0", "2.0.0", 0);

		// root's only child is orange, not red, so root stays green
		expect(root.toArray().color).toBe(GREEN);
	});

	it("prefers red over orange when the node is itself outdated", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", "2.0.0", 0);
		makeNode(a, "b", "1.0.0", "2.0.0", 0);

		expect(a.toArray().color).toBe(RED);
	});

	// Current behaviour, not necessarily desirable: getLatestVersion() returns
	// null when the registry lookup fails, which renders identically to a
	// genuinely outdated package. Tracked separately.
	it("renders an unknown latest version as red", () => {
		const root = makeNode(null, "root", "1.0.0", "1.0.0", 0);
		const a = makeNode(root, "a", "1.0.0", null, 0);

		expect(a.toArray().color).toBe(RED);
	});
});
