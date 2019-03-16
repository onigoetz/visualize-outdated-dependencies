// @ts-check
const fs = require("fs");
const path = require("path");
const lockfile = require("@yarnpkg/lockfile");
const pacote = require('pacote');
const cliProgress = require('cli-progress');
const temp = require('temp');
const opn = require('opn');

const arg = require('arg');
const NodeCache = require( "node-file-cache" );

const TreeMaker = require("./TreeMaker.js");

const latestVersionCache = NodeCache.create({
    file: path.join(__dirname, "latestVersion_cache.json"),
    life: 60 * 60 * 6 // 6 hours
});

async function getLatestVersions(lockfileDependencies) {
    const allPackages = {};
    Object.keys(lockfileDependencies).forEach(key => {
        const lastIndex = key.lastIndexOf("@");
        const package = key.substring(0, lastIndex);
        allPackages[package] = null;
    });

    const progressBar = new cliProgress.Bar({}, cliProgress.Presets.shades_classic);
    const packageList = Object.keys(allPackages);

    let done = 0;
    progressBar.start(packageList.length, done);

    await Promise.all(
        packageList.map(async package => {
            const key = `latestVersion:${package}`;
            let latestVersion = latestVersionCache.get(key);

            if (latestVersion == undefined) {
                try {
                    const manifest = await pacote.manifest(`${package}@latest`);
                    latestVersion = manifest.version;

                    latestVersionCache.set(key, latestVersion);
                } catch (error) {
                    console.log(`Could not retrieve manifest for ${package}.`, error);
                    latestVersion = null;
                }
            }
            
            done++;
            progressBar.update(done);
        
            allPackages[package] = latestVersion;

            return true;
        })
    );

    progressBar.stop();

    return allPackages;
}

const args = arg({
    // Types
    '--help':    Boolean,
    '--version': Boolean,
    '--clear-cache': Boolean,
    //'--verbose': arg.COUNT,   // Counts the number of times --verbose is passed
    //'--ignore':     [String],    // --tag <string> or --tag=<string>
 
    // Aliases
    //'-v':        '--verbose',
});

(async function () {

    if (args['--version']) {
        const packageJson = require(path.join(__dirname, "package.json"));
        console.log(`${packageJson.name} Version ${packageJson.version}`);
        return;
    }

    if (args['--help']) {
        // TODO :: write help
        console.log("No Help yet");
        return;
    }

    if (args['--clear-cache']) {
        console.log("Clearing cache");
        latestVersionCache.clear();
    }

    const currentDir = process.cwd();

    // Read lockfile
    let file = fs.readFileSync(path.join(currentDir, 'yarn.lock'), 'utf8');
    let lockfileDependencies = lockfile.parse(file).object;

    console.log("Getting latest Versions...");
    //const latestVersions = {};
    const latestVersions = await getLatestVersions(lockfileDependencies);

    // Read packages list
    const rootPackage = require(path.join(currentDir, 'package.json'));

    // Create tree
    const tree = new TreeMaker(lockfileDependencies, latestVersions);
    const resolved = tree.getTree(rootPackage);

    // Write file
    var tempName = temp.path({ suffix: ".html" });
    const template = fs.readFileSync(path.join(__dirname, "template.html"), { encoding: "UTF-8" });
    fs.writeFileSync(tempName, template.replace("DATA", JSON.stringify(resolved.toArray())));

    console.log(tempName);

    // Open in browser
    opn(tempName, { wait: false }).catch(error => {
        console.error('Unable to open web browser. ' + error);
        console.error('View HTML for the visualization at:');
        console.error(tempName);
    });
})()

