const path = require("path");
const dotenv = require('dotenv');
const webpack = require('webpack');
const { createEnvDefinePlugin } = require("../../external/wso2-vscode-extensions/common/scripts/env-webpack-helper");

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
	entry: "./src/extension.ts",
	output: {
		path: path.resolve(__dirname, "dist"),
		filename: "extension.js",
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
		],
	},
	plugins: [
        new webpack.DefinePlugin(envKeys),
		new webpack.IgnorePlugin({ resourceRegExp: /^@aws-sdk\/client-s3$/ }),
    ],
};

module.exports = config;
