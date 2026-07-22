const path = require("path");
const webpack = require("webpack");
const { ModuleFederationPlugin } = require("webpack").container;
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');

const REACT_VERSION = "18.2.0";

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
        static: {
            directory: path.resolve(__dirname, "src"),
            publicPath: "/",
        },
        headers: {
            'Access-Control-Allow-Origin': '*',
        },
        devMiddleware: {
            writeToDisk: true,
            mimeTypes: { 'text/css': ['css'] },
        },
        open: process.env.WEB_VIEW_BROWSER_MODE === "true"
            ? ['/browser.html?bridgeMode=websocket&wsServer=127.0.0.1&wsPort=8787']
            : false,
        hot: true,
        compress: false, 
    },
    plugins: [
        new webpack.ProvidePlugin({
            process: "process/browser",
        }),
        // Federation host: shares a single React runtime with the dynamically
        // loaded Ballerina BI-form remote. React is `eager` here because this
        // host bundles it directly (no async entry boundary); the remote
        // consumes it from this share scope. Remotes are loaded at runtime from
        // the URL in the bootstrap, so none are declared statically.
        new ModuleFederationPlugin({
            name: "wiWebviewHost",
            shared: {
                react: { singleton: true, eager: true, requiredVersion: REACT_VERSION },
                "react-dom": { singleton: true, eager: true, requiredVersion: REACT_VERSION },
            },
        }),
        new ReactRefreshWebpackPlugin(),
    ],
};
