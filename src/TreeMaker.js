import { readFileSync, globSync } from "node:fs";
import path from "node:path";

import Node from "./Node.js";

export default class TreeMaker {
	constructor(
		lockfileDependencies,
		latestVersion,
		sizes,
		{ verbose = false, currentDir = process.cwd() } = {},
	) {
		this.latestVersions = latestVersion;
		this.sizes = sizes;
		this.lockfileDependencies = lockfileDependencies;
		this.workspacePackages = [];
		this.verbose = verbose;
		this.currentDir = currentDir;
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
		// A missing entry means the range didn't resolve, which happens for
		// protocols we don't rewrite (git URLs, `patch:`, `portal:`, …).
		return (
			this.lockfileDependencies[`${currentPackage}@${requestedVersion}`]
				?.dependencies || {}
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

		const packages = list
			.map((pattern) => globSync(pattern, { cwd: this.currentDir }))
			.reduce((previous, current) => {
				return previous.concat(current);
			}, [])
			.map((folder) =>
				JSON.parse(
					readFileSync(
						path.join(this.currentDir, folder, "package.json"),
						"utf8",
					),
				),
			);

		this.workspacePackages = packages.map(
			(currentPackage) => currentPackage.name,
		);

		return packages;
	}

	getTree(rootPackage) {
		return this.getRootPackageDetails(rootPackage, null);
	}
}
