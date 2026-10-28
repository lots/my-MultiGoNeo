import esbuild from 'esbuild'

const emptyBrowserModule = `
module.exports = {
  encodingExists: () => true,
  decode: (buffer) => buffer.toString(),
  encode: (value) => value,
  detect: () => ({ encoding: 'UTF-8' })
}
`

await esbuild.build({
  entryPoints: ['src/sabaki-entry.js'],
  outfile: 'src/sabaki-bundle.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  minify: false,
  sourcemap: false,
  logLevel: 'info',
  plugins: [
    {
      name: 'browser-shims',
      setup(build) {
        build.onResolve({ filter: /^(fs|iconv-lite|jschardet)$/ }, (args) => ({
          path: args.path,
          namespace: 'browser-shim',
        }))
        build.onLoad({ filter: /.*/, namespace: 'browser-shim' }, () => ({
          contents: emptyBrowserModule,
          loader: 'js',
        }))
      },
    },
  ],
})
