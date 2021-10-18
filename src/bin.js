#!/usr/bin/env node

const arg = require("arg");

const { latestVersionCache, sizeCache } = require("./cache.js");
const { run } = require("./index.js");

const args = arg({
  // Types
  "--help": Boolean,
  "--version": Boolean,
  "--clear-cache": Boolean,
  "--verbose": Boolean,

  // Aliases
  "-v": "--verbose",
});

(async function() {
  if (args["--version"]) {
    const packageJson = require(path.join(__dirname, "..", "package.json"));
    console.log(`${packageJson.name} Version ${packageJson.version}`);
    return;
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
    return;
  }

  if (args["--clear-cache"]) {
    console.log("Clearing cache");
    latestVersionCache.clear();
    sizeCache.clear();
  }

  const verbose = args["--verbose"];

  const currentDir = process.cwd();

  await run(currentDir, { verbose });
})();
