const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const webpack = require("webpack");
const CopyPlugin = require("copy-webpack-plugin");
const PermissionsOutputPlugin = require("webpack-permissions-plugin");
const { createEnvDefinePlugin } = require("../../external/wso2-vscode-extensions/common/scripts/env-webpack-helper");

const distPath = path.resolve(__dirname, "dist");
fs.mkdirSync(distPath, { recursive: true });

const envPath = path.resolve(__dirname, '.env');
const env = dotenv.config({ path: envPath }).parsed;
console.log("Fetching values for environment variables...");
const { envKeys, missingVars } = createEnvDefinePlugin(env);
if (missingVars.length > 0) {
    console.warn(
        '\n⚠️  Environment Variable Configuration Warning:\n' +
        `Missing required environment variables: ${missingVars.join(', ')}\n` +
        `Please provide values in either .env file or runtime environment.\n`
    );
}

/**@type {import('webpack').Configuration}*/
const config = {
    target: "node",
	entry: {
		extension: "./src/extension.ts",
		"askpass-main": "./src/cloud/git/askpass-main.ts",
    },
	output: {
		path: distPath,
		filename: "[name].js",
		libraryTarget: "commonjs2",
		devtoolModuleFilenameTemplate: "../[resource-path]",
	},
	devtool: "source-map",
	externals: {
		vscode: "commonjs vscode",
	},
	resolve: {
		extensions: [".ts", ".js"],
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				exclude: /node_modules/,
				use: [
					{
						loader: "ts-loader",
					},
				],
			},
			{
				test: /\.m?js$/,
				type: "javascript/auto",
				resolve: {
						fullySpecified: false,
				},
			},
		],
	},
	plugins: [
        new webpack.DefinePlugin(envKeys),
		new webpack.IgnorePlugin({ resourceRegExp: /^@aws-sdk\/client-s3$/ }),
		new CopyPlugin({
				patterns: [{ from: "src/cloud/git/*.sh", to: "[name][ext]" }],
		}),
		new PermissionsOutputPlugin({
				buildFolders: [distPath],
		}),
    ],
};

module.exports = config;
