'use strict'

// electron-builder configuration.
//
// The `build` block in package.json stays the single source of truth; this file
// adds the `beforeBuild` hook (which cannot be expressed in JSON) and the
// optional bundled study records.

const fs = require('node:fs')
const path = require('node:path')

const pkg = require('./package.json')

// Local SGF study records. The folder is git-ignored, so a clean clone or CI
// build simply omits it; a local build picks up whatever is there at build time.
// Rebuilding is all that is needed to refresh the bundled files.
const bundledSgfSource = path.join(__dirname, 'AQ', 'sgf', '十三路打谱操')
const extraFiles = fs.existsSync(bundledSgfSource)
  ? [{ from: bundledSgfSource, to: 'sgf/十三路打谱操' }]
  : []

if (extraFiles.length > 0) {
  console.log(`[electron-builder] bundling SGF records from ${path.relative(__dirname, bundledSgfSource)}`)
}

module.exports = {
  ...pkg.build,
  extraFiles,
  async beforeBuild() {
    const runtimeDependencies = Object.keys(pkg.dependencies || {})
    if (runtimeDependencies.length > 0) {
      throw new Error(
        `MultiGo Neo now has runtime dependencies (${runtimeDependencies.join(', ')}). ` +
          'Remove this beforeBuild override so electron-builder bundles them into the app.'
      )
    }
    return false
  },
}
