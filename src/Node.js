const prettyBytes = require('pretty-bytes');

// Colors
const GREEN = 0;
const ORANGE = 1;
const RED = 2;

module.exports = class Node {
  constructor(parent, name, currentVersion, latestVersion, size, verbose) {
    this.parent = parent;
    this.name = name;
    this.version = currentVersion;
    this.latestVersion = latestVersion;
    this.children = [];
    this.size = size;
    this.verbose = verbose;
  }

  getParents() {
    const parents = this.parent ? this.parent.getParents() : [];
    return parents.concat([`${this.name}@${this.version}`]);
  }

  isCircularDependency(newDependencyName, newDependencyResolvedVersion) {
    if (
      this.name === newDependencyName &&
      this.version === newDependencyResolvedVersion
    ) {
      return true;
    }

    if (
      this.parent &&
      this.parent.isCircularDependency(
        newDependencyName,
        newDependencyResolvedVersion
      )
    ) {
      return true;
    }

    return false;
  }

  isPeerDependency(newDependencyName, newDependencyResolvedVersion) {
    if (
      this.children.some(
        (node) =>
          node.name === newDependencyName &&
          node.version === newDependencyResolvedVersion
      )
    ) {
      return true;
    }

    if (
      this.parent &&
      this.parent.isPeerDependency(
        newDependencyName,
        newDependencyResolvedVersion
      )
    ) {
      return true;
    }

    return false;
  }

  getSize() {
    return (
      this.size +
      this.children
        .map((node) => {
          const pv = `${node.name}@${node.version}`;
          if (this.isCircularDependency(node.name, node.version)) {
            if (this.verbose) {
              const parents = node.getParents().join(" => ");
              console.log(
                `Circular dependency on ${pv}, cutting here: ${parents}. Skipping for size calculation.`
              );
            }

            return 0;
          }

          if (this.parent) {
            const isPeerDependency = this.parent.isPeerDependency(
              node.name,
              node.version
            );

            if (isPeerDependency) {
              if (this.verbose) {
                console.log(
                  `Dependency ${pv} is already a dependency on one of its parent. Skipping for size calculation.`
                );
              }

              return 0;
            }
          }

          return node.getSize();
        })
        .reduce((previous, current) => previous + current, 0)
    );
  }

  toArray() {
    const children = this.children
      .filter((node) => {
        if (!this.parent) {
          return true;
        }

        const isPeerDependency = this.parent.isPeerDependency(
          node.name,
          node.version
        );

        if (isPeerDependency && this.verbose) {
          console.log(
            `Dependency ${node.name}@${node.version} is already a dependency on one of its parent.`
          );
        }

        return !isPeerDependency;
      })
      .map((node) => node.toArray());

    const size = this.getSize();

    const node = {
      name: `${this.name}@${this.version}`,
      version: this.version,
      latest: this.latestVersion,
      size,
      sizeF: prettyBytes(size),
      children,
      value: children.length || 1,
      color: GREEN,
    };

    // If one child is red, we're orange
    // We don't inherit the color orange more than one level since there is nothing actionable on the package
    if (children.some((value) => value.color === RED)) {
      node.color = ORANGE;
    }

    if (this.version !== this.latestVersion) {
      node.color = RED;
    }

    return node;
  }
};
