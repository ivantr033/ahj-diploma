const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
    entry: './src/index.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].[contenthash].js',
        clean: true,
    },
    module: {
        rules: [
            { test: /\.js$/, exclude: /node_modules/, use: { loader: 'babel-loader' } },
            { test: /\.html$/, use: { loader: 'html-loader' } },
            { test: /\.css$/, use: [MiniCssExtractPlugin.loader, 'css-loader'] },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({ template: './src/index.html', filename: 'index.html' }),
        new MiniCssExtractPlugin({ filename: '[name].[contenthash].css' }),
    ],
};
