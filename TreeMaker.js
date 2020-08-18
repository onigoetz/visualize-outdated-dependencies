const path = require("path");
const glob = require("glob");

const Node = require("./Node.js");

module.exports = class TreeMaker {
  constructor(lockfileDependencies, latestVersion, verbose) {
    this.latestVersions = latestVersion;
    this.lockfileDependencies = lockfileDependencies;
    this.workspacePackages = [];
    this.verbose = verbose;
  }

  getLatestVersion(currentPackage) {
    return this.latestVersions[currentPackage] || null;
  }

  getCurrentVersion(currentPackage, requestedVersion) {
    // If the key doesn't exist, we're already at the latest version
    if (!this.lockfileDependencies[`${currentPackage}@${requestedVersion}`]) {
      return requestedVersion;
    }

    return this.lockfileDependencies[`${currentPackage}@${requestedVersion}`]
      .version;
  }

  getDependencies(currentPackage, requestedVersion) {
    return (
      this.lockfileDependencies[`${currentPackage}@${requestedVersion}`]
        .dependencies || {}
    );
  }

  computeDependencies(node, dependencies) {
    Object.keys(dependencies).forEach(currentPackage => {
      // Exclude packages from workspace
      // As they aren't present in the lockfile
      if (this.workspacePackages.indexOf(currentPackage) >= 0) {
        return;
      }

      const requestedVersion = dependencies[currentPackage];
      const currentVersion = this.getCurrentVersion(
        currentPackage,
        requestedVersion
      );

      if (
        node.parent &&
        node.parent.isPeerDependency(currentPackage, currentVersion)
      ) {
        if (this.verbose) {
          console.log(
            `Dependency ${currentPackage}@${currentVersion} is already a dependency on one of its parent.`
          );
        }
        return;
      }

      if (node.isCircularDependency(currentPackage, currentVersion)) {
        if (this.verbose) {
          console.log(
            `Circular dependency on ${currentPackage}@${currentVersion}, cutting here: ${node
              .getParents()
              .join(" => ")}`
          );
        }

        return;
      }

      node.children.push(
        this.getPackageDetails(node, currentPackage, requestedVersion)
      );
    });
  }

  getRootPackageDetails(file, parent) {
    console.log("Computing dependencies for", file.name);

    const node = new Node(
      parent,
      file.name,
      file.version,
      file.version,
      this.verbose
    );

    this.computeDependencies(node, {
      ...(file.dependencies || {}),
      ...(file.devDependencies || {}),
      ...(file.optionalDependencies || {})
    });

    if (file.workspaces) {
      this.getWorkspaces(file.workspaces).forEach(currentPackage => {
        node.children.push(this.getRootPackageDetails(currentPackage, node));
      });
    }

    return node;
  }

  getPackageDetails(parent, currentPackage, requestedVersion) {
    const currentVersion = this.getCurrentVersion(
      currentPackage,
      requestedVersion
    );

    const node = new Node(
      parent,
      currentPackage,
      currentVersion,
      this.getLatestVersion(currentPackage),
      this.verbose
    );

    this.computeDependencies(
      node,
      this.getDependencies(currentPackage, requestedVersion)
    );

    return node;
  }

  getWorkspaces(workspaces) {
    const list = Array.isArray(workspaces) ? workspaces : workspaces.packages;

    const currentDir = process.cwd();

    const packages = list
      .map(pattern => glob.sync(pattern))
      .reduce((previous, current) => {
        return previous.concat(current);
      }, [])
      .map(folder => require(path.join(currentDir, folder, "package.json")));

    this.workspacePackages = packages.map(
      currentPackage => currentPackage.name
    );

    return packages;
  }

  getTree(rootPackage) {
    return this.getRootPackageDetails(rootPackage, null);
  }
};
