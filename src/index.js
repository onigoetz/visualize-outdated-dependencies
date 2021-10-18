const fs = require("fs");
const path = require("path");
const lockfile = require("@yarnpkg/lockfile");
const pacote = require("pacote");
const cliProgress = require("cli-progress");
const temp = require("temp");
const open = require("open");

const { latestVersionCache, sizeCache } = require("./cache.js");
const TreeMaker = require("./TreeMaker.js");

async function getLatestVersion(pack) {
  const key = `latestVersion:${pack}`;
  let latestVersion = latestVersionCache.get(key);
  if (!latestVersion) {
    try {
      const manifest = await pacote.manifest(`${pack}@latest`);
      latestVersion = manifest.version;

      latestVersionCache.set(key, latestVersion);
    } catch (error) {
      console.error(`Could not retrieve manifest for ${pack}.`, error);
      latestVersion = null;
    }
  }

  return latestVersion;
}

async function getPackageSize(package, version) {
  const key = `size:${package}:${version}`;
  let size = sizeCache.get(key);
  if (!size) {
    try {
      const manifest = await pacote.manifest(`${package}@${version}`);
      size = manifest.dist.unpackedSize;

      sizeCache.set(key, size);
    } catch (error) {
      console.error(`Could not retrieve manifest for ${package}@${version}.`, error);
      size = 0;
    }
  }

  return size;
}

async function getData(lockfileDependencies) {
  const latestVersions = {};
  const sizes = {};
  Object.keys(lockfileDependencies).forEach(key => {
    const pack = key.substring(0, key.lastIndexOf("@"));
    latestVersions[pack] = null;
    sizes[`${pack}@${lockfileDependencies[key].version}`] = null;
  });

  const progressBar = new cliProgress.Bar(
    {},
    cliProgress.Presets.shades_classic
  );
  const latestVersionPackageList = Object.keys(latestVersions);
  const sizePackageList = Object.keys(sizes)

  let done = 0;
  progressBar.start(latestVersionPackageList.length + sizePackageList.length, done);

  const promises = [].concat(
    latestVersionPackageList.map(async pack => {
      const latestVersion = await getLatestVersion(pack);
      latestVersions[pack] = latestVersion;

      done++;
      progressBar.update(done);

      return true;
    })
  ).concat(
    sizePackageList.map(async key => {
      const package = key.substring(0, key.lastIndexOf("@"));
      const version = key.substring(key.lastIndexOf("@")+1);

      const size = await getPackageSize(package, version);
      sizes[key] = size;

      done++;
      progressBar.update(done);

      return true;
    })
  )

  await Promise.all(promises);

  progressBar.stop();

  return { latestVersions, sizes };
}

async function run(currentDir, { verbose, shouldOpen = true }) {
  // Read lockfile
  const file = fs.readFileSync(path.join(currentDir, "yarn.lock"), "utf8");
  const lockfileDependencies = lockfile.parse(file).object;

  console.log("Getting latest Versions...");
  const { latestVersions, sizes } = await getData(lockfileDependencies);

  // Read packages list
  const rootPackage = require(path.join(currentDir, "package.json"));

  // Create tree
  const tree = new TreeMaker(lockfileDependencies, latestVersions, sizes, verbose);
  const resolved = tree.getTree(rootPackage);

  // Write report
  var tempName = temp.path({ suffix: ".html" });
  const template = fs.readFileSync(path.join(__dirname, "template.html"), {
    encoding: "utf-8"
  });
  fs.writeFileSync(
    tempName,
    // By doubly stringifying the parser can deserialize this faster
    template.replace("DATA", JSON.stringify(JSON.stringify(resolved.toArray())))
  );

  console.log("Written report to", tempName);

  let displayMessage = false;

  // Open in browser
  if (shouldOpen) {
    open(tempName, { wait: false }).catch((error) => {
      console.error(`Unable to open web browser: ${error}`);
      displayMessage = true;
    });
  } else {
    displayMessage = true;
  }

  if (displayMessage) {
    console.error("View HTML for the visualization at:");
    console.error(tempName);
  }
}

module.exports = {
  run,
  getLatestVersion,
  getData,
  getPackageSize
}