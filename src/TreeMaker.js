import path from "node:path";
import { glob } from "glob";

import Node from "./Node.js";

export default class TreeMaker {
	constructor(lockfileDependencies, latestVersion, sizes, verbose) {
		this.latestVersions = latestVersion;
		this.sizes = sizes;
		this.lockfileDependencies = lockfileDependencies;
		this.workspacePackages = [];
		this.verbose = verbose;
	}

	getLatestVersion(currentPackage) {
		return this.latestVersions[currentPackage] || null;
	}

	getSize(pack, version) {
		return this.sizes[`${pack}@${version}`] || null;
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
		for (const currentPackage of Object.keys(dependencies)) {
			// Exclude packages from workspace
			// As they aren't present in the lockfile
			if (this.workspacePackages.indexOf(currentPackage) >= 0) {
				continue;
			}

			const requestedVersion = dependencies[currentPackage];
			const currentVersion = this.getCurrentVersion(
				currentPackage,
				requestedVersion,
			);

			if (node.parent?.isPeerDependency(currentPackage, currentVersion)) {
				if (this.verbose) {
					console.log(
						`Dependency ${currentPackage}@${currentVersion} is already a dependency on one of its parent.`,
					);
				}
				continue;
			}

			if (node.isCircularDependency(currentPackage, currentVersion)) {
				if (this.verbose) {
					console.log(
						`Circular dependency on ${currentPackage}@${currentVersion}, cutting here: ${node
							.getParents()
							.join(" => ")}`,
					);
				}

				continue;
			}

			node.children.push(
				this.getPackageDetails(node, currentPackage, requestedVersion),
			);
		}
	}

	getRootPackageDetails(file, parent) {
		console.log("Computing dependencies for", file.name);

		const node = new Node(
			parent,
			file.name,
			file.version,
			file.version,
			0,
			this.verbose,
		);

		this.computeDependencies(node, {
			...(file.dependencies || {}),
			...(file.devDependencies || {}),
			...(file.optionalDependencies || {}),
		});

		if (file.workspaces) {
			for (const currentPackage of this.getWorkspaces(file.workspaces)) {
				node.children.push(this.getRootPackageDetails(currentPackage, node));
			}
		}

		return node;
	}

	getPackageDetails(parent, currentPackage, requestedVersion) {
		const currentVersion = this.getCurrentVersion(
			currentPackage,
			requestedVersion,
		);

		const node = new Node(
			parent,
			currentPackage,
			currentVersion,
			this.getLatestVersion(currentPackage),
			this.getSize(currentPackage, currentVersion),
			this.verbose,
		);

		this.computeDependencies(
			node,
			this.getDependencies(currentPackage, requestedVersion),
		);

		return node;
	}

	getWorkspaces(workspaces) {
		const list = Array.isArray(workspaces) ? workspaces : workspaces.packages;

		const currentDir = process.cwd();

		const packages = list
			.map((pattern) => glob.sync(pattern))
			.reduce((previous, current) => {
				return previous.concat(current);
			}, [])
			.map((folder) => require(path.join(currentDir, folder, "package.json")));

		this.workspacePackages = packages.map(
			(currentPackage) => currentPackage.name,
		);

		return packages;
	}

	getTree(rootPackage) {
		return this.getRootPackageDetails(rootPackage, null);
	}
}
