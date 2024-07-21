import path from "node:path";
import { fileURLToPath } from "node:url";
import NodeCache from "node-file-cache";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export const latestVersionCache = NodeCache.create({
	file: path.join(__dirname, "latestVersion_cache.json"),
	life: 60 * 60 * 6, // 6 hours
});

export const sizeCache = NodeCache.create({
	file: path.join(__dirname, "size_cache.json"),
	life: 60 * 60 * 24, // 6 hours
});
