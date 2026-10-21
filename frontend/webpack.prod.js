const { merge } = require('webpack-merge');
const common = require('./webpack.common');
const { InjectManifest } = require('workbox-webpack-plugin');
const path = require('path');

module.exports = merge(common, {
    mode: 'production',
    devtool: false,
    plugins: [
        new InjectManifest({
            swSrc: path.resolve(__dirname, 'src/service-worker.js'),
            swDest: 'service-worker.js',
        }),
    ],
});
