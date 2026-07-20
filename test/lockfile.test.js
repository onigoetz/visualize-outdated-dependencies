import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseLockfile, splitDescriptor } from "../src/lockfile.js";

const BERRY_HEADER = `__metadata:
  version: 10
  cacheKey: 10c0
`;

function berry(entries) {
	return `${BERRY_HEADER}\n${entries}`;
}

describe("splitDescriptor", () => {
	it("splits a plain descriptor", () => {
		assert.deepEqual(splitDescriptor("a@^1.0.0"), {
			name: "a",
			range: "^1.0.0",
		});
	});

	it("keeps the scope with the name", () => {
		assert.deepEqual(splitDescriptor("@scope/pkg@^1.0.0"), {
			name: "@scope/pkg",
			range: "^1.0.0",
		});
	});

	it("splits an alias on the first @, not the last", () => {
		assert.deepEqual(splitDescriptor("string-width-cjs@string-width@^4.2.0"), {
			name: "string-width-cjs",
			range: "string-width@^4.2.0",
		});
	});

	it("handles a descriptor with no range", () => {
		assert.deepEqual(splitDescriptor("a"), { name: "a", range: "" });
	});
});

describe("parseLockfile format detection", () => {
	it("parses a yarn classic lockfile", () => {
		const parsed = parseLockfile(`# yarn lockfile v1


a@^1.0.0:
  version "1.0.0"
  dependencies:
    b "^2.0.0"
`);

		assert.equal(parsed["a@^1.0.0"].version, "1.0.0");
		// @yarnpkg/lockfile hands back null-prototype objects, so compare entries.
		assert.deepEqual(Object.entries(parsed["a@^1.0.0"].dependencies), [
			["b", "^2.0.0"],
		]);
	});

	it("parses a yarn berry lockfile", () => {
		const parsed = parseLockfile(
			berry(`"a@npm:^1.0.0":
  version: 1.0.0
  resolution: "a@npm:1.0.0"
  languageName: node
  linkType: hard
`),
		);

		assert.deepEqual(Object.keys(parsed), ["a@^1.0.0"]);
	});
});

describe("parseLockfile with a berry lockfile", () => {
	it("drops the __metadata entry", () => {
		const parsed = parseLockfile(berry(""));

		assert.deepEqual(parsed, {});
	});

	it("strips the npm: protocol from keys and dependency ranges", () => {
		const parsed = parseLockfile(
			berry(`"a@npm:^1.0.0":
  version: 1.0.0
  dependencies:
    b: "npm:^2.0.0"
`),
		);

		assert.deepEqual(parsed["a@^1.0.0"].dependencies, { b: "^2.0.0" });
	});

	it("fans a multi-descriptor key out into one entry per descriptor", () => {
		const parsed = parseLockfile(
			berry(`"a@npm:^1.0.0, a@npm:^1.1.0, a@npm:1":
  version: 1.2.0
`),
		);

		assert.deepEqual(Object.keys(parsed), ["a@^1.0.0", "a@^1.1.0", "a@1"]);
		assert.equal(parsed["a@^1.1.0"].version, "1.2.0");
	});

	it("keeps the scope on scoped packages", () => {
		const parsed = parseLockfile(
			berry(`"@scope/pkg@npm:^1.0.0":
  version: 1.0.0
`),
		);

		assert.deepEqual(Object.keys(parsed), ["@scope/pkg@^1.0.0"]);
	});

	it("skips workspace entries, which are not real packages", () => {
		const parsed = parseLockfile(
			berry(`"root@workspace:.":
  version: 0.0.0-use.local
  resolution: "root@workspace:."
  languageName: unknown
  linkType: soft

"a@npm:^1.0.0":
  version: 1.0.0
  linkType: hard
`),
		);

		assert.deepEqual(Object.keys(parsed), ["a@^1.0.0"]);
	});

	it("excludes peerDependencies, matching yarn classic", () => {
		const parsed = parseLockfile(
			berry(`"a@npm:^1.0.0":
  version: 1.0.0
  dependencies:
    b: "npm:^2.0.0"
  peerDependencies:
    c: "^1.0.0"
`),
		);

		assert.deepEqual(parsed["a@^1.0.0"].dependencies, { b: "^2.0.0" });
	});

	it("leaves non-npm protocols verbatim", () => {
		const parsed = parseLockfile(
			berry(`"a@patch:a@npm%3A1.0.0#~/.yarn/patch.diff":
  version: 1.0.0
`),
		);

		assert.deepEqual(Object.keys(parsed), [
			"a@patch:a@npm%3A1.0.0#~/.yarn/patch.diff",
		]);
	});

	it("omits dependencies entirely when the entry has none", () => {
		const parsed = parseLockfile(
			berry(`"a@npm:^1.0.0":
  version: 1.0.0
`),
		);

		assert.equal(parsed["a@^1.0.0"].dependencies, undefined);
	});
});
