'use strict'

// electron-builder configuration.
//
// The `build` block in package.json stays the single source of truth; this file only adds
// the `beforeBuild` hook, which cannot be expressed in JSON.
//
// Returning false tells electron-builder that node_modules are handled externally. That is
// true here: there are no runtime dependencies (everything the app needs is committed under
// src/ or bundled into src/sabaki-bundle.js), so app.asar must contain only the app files.
// It also skips the production-dependency scan, which shells out to `npm ls` with captured
// stdio — that fails under restricted sandboxes even though the answer would be "no
// dependencies".

const pkg = require('./package.json')

module.exports = {
  ...pkg.build,
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
