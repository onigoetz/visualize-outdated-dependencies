const path = require("path");
const NodeCache = require("node-file-cache");

const latestVersionCache = NodeCache.create({
  file: path.join(__dirname, "latestVersion_cache.json"),
  life: 60 * 60 * 6, // 6 hours
});

const sizeCache = NodeCache.create({
  file: path.join(__dirname, "size_cache.json"),
  life: 60 * 60 * 24, // 6 hours
});

module.exports = {
  latestVersionCache,
  sizeCache,
};
