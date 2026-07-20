import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { renderReport } from "../src/report.js";

const tree = {
	name: "root@1.0.0",
	version: "1.0.0",
	latest: "1.0.0",
	size: 1024,
	sizeF: "1.02 kB",
	children: [],
	value: 1,
	color: 0,
};

describe("renderReport", () => {
	it("replaces the DATA placeholder", () => {
		const result = renderReport(tree, "<script>const data = DATA;</script>");

		assert.ok(!result.includes("DATA"));
		assert.ok(result.startsWith("<script>const data = "));
	});

	it("embeds the tree as a double-encoded JSON string", () => {
		const result = renderReport(tree, "DATA");

		// The template consumes it as a string literal, so one parse yields the
		// JSON text and a second yields the tree itself.
		assert.deepEqual(JSON.parse(JSON.parse(result)), tree);
	});

	it("survives values that need escaping", () => {
		const tricky = { name: 'a"b</script>\\', children: [] };
		const result = renderReport(tricky, "DATA");

		assert.deepEqual(JSON.parse(JSON.parse(result)), tricky);
	});

	it("leaves the rest of the real template intact", () => {
		const template = readFileSync(
			new URL("../src/template.html", import.meta.url),
			"utf8",
		);
		const result = renderReport(tree, template);

		assert.ok(result.includes("<html"));
		assert.ok(!result.includes(">DATA<"));
		assert.equal(result.split("\n").length, template.split("\n").length);
	});
});
