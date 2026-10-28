const path = require('path')
const webpack = require('webpack')

module.exports = (env, argv) => ({
  entry: './src/components/App.js',

  plugins: [
    // Shudan draws board lines/arrows but offers no way to colour them: its
    // Goban forwards only {v1, v2, type, vertexSize} to Line, and Line ignores
    // everything else. Swap in a copy that understands a colour suffix on
    // `type` (e.g. "arrow:red"), which is how the edit tools paint colours.
    // See src/vendor/shudanLine.js.
    new webpack.NormalModuleReplacementPlugin(
      /[\\/]@sabaki[\\/]shudan[\\/]src[\\/]Line\.js$/,
      path.resolve(__dirname, 'src/vendor/shudanLine.js'),
    ),
    // Shudan's Vertex collapses every positive paint value to the single class
    // `shudan-paint_1`, so a painted vertex can only be black or white. Sabaki
    // passes DD colours through the numeric paint value and needs a class per
    // colour. See src/vendor/shudanVertex.js.
    new webpack.NormalModuleReplacementPlugin(
      /[\\/]@sabaki[\\/]shudan[\\/]src[\\/]Vertex\.js$/,
      path.resolve(__dirname, 'src/vendor/shudanVertex.js'),
    ),
  ],

  output: {
    filename: 'bundle.js',
    path: __dirname,
  },

  devtool: argv.mode === 'production' ? false : 'eval-cheap-module-source-map',
  target: 'electron-renderer',

  node: {
    __dirname: false,
  },

  resolve: {
    alias: {
      // Vendored Shudan files (src/vendor/) are compiled with Shudan's own
      // module context, so they cannot use relative paths back into src/.
      // This alias is how they reach Sabaki modules.
      '@sabaki-app': path.resolve(__dirname, 'src'),
      react: 'preact/compat',
      'react-dom/test-utils': 'preact/test-utils',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },

  externals: {
    '@sabaki/i18n': 'require("@sabaki/i18n")',
    'cross-spawn': 'null',
    'iconv-lite': 'require("iconv-lite")',
    moment: 'null',
  },
})
