/**
 * Injects a serialized tree into the report template.
 *
 * The payload is stringified twice on purpose: the template embeds it as a
 * JSON string literal, which the browser's parser handles faster than parsing
 * an inline object literal of the same shape.
 */
export function renderReport(tree, template) {
	return template.replace("DATA", JSON.stringify(JSON.stringify(tree)));
}
