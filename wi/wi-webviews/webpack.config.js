const path = require("path");
const webpack = require("webpack");
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

module.exports = {
    entry: "./src/index.tsx",
    target: "web",
    devtool: !process.env.CI ? "inline-source-map" : undefined,
    mode: !process.env.CI ? "development" : "production",
    output: {
        path: path.resolve(__dirname, "build"),
        filename: "main.js",
        library: "wiWebview",
        publicPath: "http://localhost:3000/lib/",
    },
    resolve: {
        extensions: [".js", ".jsx", ".json", ".ts", ".tsx"],
        alias: {
            'react': path.resolve(__dirname, 'node_modules/react'),
            'react-dom': path.resolve(__dirname, 'node_modules/react-dom')
        },
        fallback: { 'process/browser': require.resolve('process/browser'), }
    },
    module: {
        rules: [
            {
                test: /\.(ts|tsx)$/,
                loader: "ts-loader",
                exclude: '/node_modules/',
            },
            {
                test: /\.css$/,
                use: [
                    'style-loader',
                    'css-loader'
                ]
            },
            {
                test: /\.s[ac]ss$/i,
                use: ["style-loader", "css-loader", "sass-loader"],
            },
            {
                test: /\.(woff|woff2|ttf|eot)$/,
                type: 'asset/inline',
            },
            {
                test: /\.(svg|png)$/,
                type: 'asset/resource',
                generator: {
                    filename: './images/[name][ext]',
                },
            }
        ],
        noParse: [require.resolve("@ts-morph/common/dist/typescript.js")],
    },
    devServer: {
        allowedHosts: 'all',
        port: 3000,
        headers: {
            'Access-Control-Allow-Origin': '*',
        },
        devMiddleware: {
            writeToDisk: true,
            mimeTypes: { 'text/css': ['css'] },
        },
        hot: true,
        compress: false, 
    },
    plugins: [
        new webpack.ProvidePlugin({
            process: "process/browser",
        }),
        new ReactRefreshWebpackPlugin(),
    ],
};
