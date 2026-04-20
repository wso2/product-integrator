interface InstalledPluginLike {
	id: string;
	packageJSON?: {
		version?: string;
	};
}

export function formatInstalledPluginLogLines(extensions: readonly InstalledPluginLike[]): string[] {
	const lines = ["Installed plugins:"];

	if (extensions.length === 0) {
		return [...lines, "(none)"];
	}

	return [
		...lines,
		...[...extensions]
			.sort((left: InstalledPluginLike, right: InstalledPluginLike) => left.id.localeCompare(right.id))
			.map((extension: InstalledPluginLike) => `${extension.id}: ${extension.packageJSON?.version ?? "Unknown"}`),
	];
}
