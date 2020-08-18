// @ts-check
const fs = require("fs");
const path = require("path");
const lockfile = require("@yarnpkg/lockfile");
const pacote = require("pacote");
const cliProgress = require("cli-progress");
const temp = require("temp");
const open = require("open");
const arg = require("arg");
const NodeCache = require("node-file-cache");

const TreeMaker = require("./TreeMaker.js");

const latestVersionCache = NodeCache.create({
  file: path.join(__dirname, "latestVersion_cache.json"),
  life: 60 * 60 * 6 // 6 hours
});

async function getLatestVersions(lockfileDependencies) {
  const allPackages = {};
  Object.keys(lockfileDependencies).forEach(key => {
    allPackages[key.substring(0, key.lastIndexOf("@"))] = null;
  });

  const progressBar = new cliProgress.Bar(
    {},
    cliProgress.Presets.shades_classic
  );
  const packageList = Object.keys(allPackages);

  let done = 0;
  progressBar.start(packageList.length, done);

  await Promise.all(
    packageList.map(async pack => {
      const key = `latestVersion:${pack}`;
      let latestVersion = latestVersionCache.get(key);

      if (latestVersion === undefined) {
        try {
          const manifest = await pacote.manifest(`${pack}@latest`);
          latestVersion = manifest.version;

          latestVersionCache.set(key, latestVersion);
        } catch (error) {
          console.error(`Could not retrieve manifest for ${pack}.`, error);
          latestVersion = null;
        }
      }

      done++;
      progressBar.update(done);

      allPackages[pack] = latestVersion;

      return true;
    })
  );

  progressBar.stop();

  return allPackages;
}

const args = arg({
  // Types
  "--help": Boolean,
  "--version": Boolean,
  "--clear-cache": Boolean,
  "--verbose": Boolean,

  // Aliases
  "-v": "--verbose"
});

(async function() {
  if (args["--version"]) {
    const packageJson = require(path.join(__dirname, "package.json"));
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
  }

  const verbose = args["--verbose"];

  const currentDir = process.cwd();

  // Read lockfile
  const file = fs.readFileSync(path.join(currentDir, "yarn.lock"), "utf8");
  const lockfileDependencies = lockfile.parse(file).object;

  console.log("Getting latest Versions...");
  const latestVersions = await getLatestVersions(lockfileDependencies);

  // Read packages list
  const rootPackage = require(path.join(currentDir, "package.json"));

  // Create tree
  const tree = new TreeMaker(lockfileDependencies, latestVersions, verbose);
  const resolved = tree.getTree(rootPackage);

  // Write file
  var tempName = temp.path({ suffix: ".html" });
  const template = fs.readFileSync(path.join(__dirname, "template.html"), {
    encoding: "utf-8"
  });
  fs.writeFileSync(
    tempName,
    template.replace("DATA", JSON.stringify(resolved.toArray()))
  );

  console.log("Written report to", tempName);

  // Open in browser
  open(tempName, { wait: false }).catch(error => {
    console.error(`Unable to open web browser: ${error}`);
    console.error("View HTML for the visualization at:");
    console.error(tempName);
  });
})();
