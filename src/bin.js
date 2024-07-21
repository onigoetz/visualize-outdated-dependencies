#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import arg from "arg";

import { latestVersionCache, sizeCache } from "./cache.js";
import { run } from "./index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const args = arg({
	// Types
	"--help": Boolean,
	"--version": Boolean,
	"--clear-cache": Boolean,
	"--verbose": Boolean,

	// Aliases
	"-v": "--verbose",
});

if (args["--version"]) {
	const packageJson = require(path.join(__dirname, "..", "package.json"));
	console.log(`${packageJson.name} Version ${packageJson.version}`);
	process.exit(0);
}

if (args["--help"]) {
	console.log(`
  Run this command within a node package to get the up-to-date ness of its dependencies, for the current package and all its children.
  In case of yarn workspaces, all packages are included.

  Command:
    outdated-dependencies

  Options:
    --clear-cache Clear dependencies cache
    --help        Show this help
    --version     Show the version and exit
    --verbose, -v Also display debug information
          `);
	process.exit(0);
}

if (args["--clear-cache"]) {
	console.log("Clearing cache");
	latestVersionCache.clear();
	sizeCache.clear();
}

const verbose = args["--verbose"];

const currentDir = process.cwd();

await run(currentDir, { verbose });
