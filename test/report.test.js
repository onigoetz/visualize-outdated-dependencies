import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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

		expect(result).not.toContain("DATA");
		expect(result.startsWith("<script>const data = ")).toBe(true);
	});

	it("embeds the tree as a double-encoded JSON string", () => {
		const result = renderReport(tree, "DATA");

		// The template consumes it as a string literal, so one parse yields the
		// JSON text and a second yields the tree itself.
		expect(JSON.parse(JSON.parse(result))).toEqual(tree);
	});

	it("survives values that need escaping", () => {
		const tricky = { name: 'a"b</script>\\', children: [] };
		const result = renderReport(tricky, "DATA");

		expect(JSON.parse(JSON.parse(result))).toEqual(tricky);
	});

	it("leaves the rest of the real template intact", () => {
		const template = readFileSync(
			new URL("../src/template.html", import.meta.url),
			"utf8",
		);
		const result = renderReport(tree, template);

		expect(result).toContain("<html");
		expect(result).not.toContain(">DATA<");
		expect(result.split("\n")).toHaveLength(template.split("\n").length);
	});
});
