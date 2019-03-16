const path = require("path");
const glob = require("glob");

const Node = require("./Node.js");

module.exports = class TreeMaker {
    constructor(lockfileDependencies, latestVersion) {
        this.latestVersions = latestVersion;
        this.lockfileDependencies = lockfileDependencies;
        this.workspacePackages = [];
    }

    getLatestVersion(currentPackage) {
        return this.latestVersions[currentPackage] || null;
    }

    getCurrentVersion(currentPackage, requestedVersion) {
        //console.log("getCurrentVersion()", package, requestedVersion)
        // If the key doesn't exist, we're already at the latest version
        if (!this.lockfileDependencies[`${currentPackage}@${requestedVersion}`]) {
            return requestedVersion;
        }

        return this.lockfileDependencies[`${currentPackage}@${requestedVersion}`].version;
    }

    getDependencies(currentPackage, requestedVersion) {
        return this.lockfileDependencies[`${currentPackage}@${requestedVersion}`].dependencies || {}
    }

    computeDependencies(node, dependencies) {
        Object.keys(dependencies).forEach(currentPackage => {

            // Exclude packages from workspace
            // As they aren't present in the lockfile
            if (this.workspacePackages.indexOf(currentPackage) >= 0) {
                return;
            }

            const requestedVersion = dependencies[currentPackage];
            const currentVersion = this.getCurrentVersion(currentPackage, requestedVersion);

            if (node.parent && node.parent.isPeerDependency(currentPackage, currentVersion)) {
                console.log(`Dependency ${currentPackage}@${currentVersion} is already a dependency on one of its parent.`);
                return;
            }
            
            if (node.isCircularDependency(currentPackage, currentVersion)) {
                console.log(`Circular dependency on ${currentPackage}@${currentVersion}, cutting here: ${node.getParents().join(" => ")}`)
                return;
            }


            node.children.push(this.getPackageDetails(node, currentPackage, requestedVersion));
        })
    }


    getRootPackageDetails(file, parent) {
        console.log("RootPackage", file.name);

        const node = new Node(parent, file.name, file.version, file.version);
        
        this.computeDependencies(node, {
            ...file.dependencies || {},
            ...file.devDependencies || {},
            ...file.optionalDependencies || {}
        });

        if (file.workspaces) {
            this.getWorkspaces(file.workspaces).forEach(currentPackage => {
                node.children.push(this.getRootPackageDetails(currentPackage, node));
            });
        }

        return node;
    }

    getPackageDetails(parent, currentPackage, requestedVersion) {
        const currentVersion = this.getCurrentVersion(currentPackage, requestedVersion);

        const node = new Node(parent, currentPackage, currentVersion, this.getLatestVersion(currentPackage));
        
        this.computeDependencies(node, this.getDependencies(currentPackage, requestedVersion))

        return node;
    }

    getWorkspaces(workspaces) {
        let list = Array.isArray(workspaces) ? workspaces : workspaces.packages;

        const currentDir = process.cwd();

        const packages = list
            .map(pattern => glob.sync(pattern))
            .reduce((previous, current) => {
                return previous.concat(current);
            }, [])
            .map(folder => require(path.join(currentDir, folder, 'package.json')));

        this.workspacePackages = packages.map(currentPackage => currentPackage.name);

        console.log(packages, this.workspacePackages);

        return packages;
    }

    getTree(rootPackage) {
        return this.getRootPackageDetails(rootPackage, null);
    }
}