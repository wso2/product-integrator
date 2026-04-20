interface InstalledPluginLike {
	id: string;
	packageJSON?: {
		version?: string;
	};
}

export function formatInstalledPluginLogLines(extensions: readonly InstalledPluginLike[]): string[] {
	const lines = ["Installed plugins:"];
	const wso2Extensions = [...extensions]
		.filter((extension: InstalledPluginLike) => extension.id.startsWith("wso2."))
		.map((extension: InstalledPluginLike) => ({
			name: extension.id.slice("wso2.".length),
			version: extension.packageJSON?.version ?? "Unknown",
		}))
		.sort((left, right) => left.name.localeCompare(right.name));

	if (wso2Extensions.length === 0) {
		return [...lines, "(none)"];
	}

	return [
		...lines,
		...wso2Extensions.map((extension) => `${extension.name}: ${extension.version}`),
	];
}
