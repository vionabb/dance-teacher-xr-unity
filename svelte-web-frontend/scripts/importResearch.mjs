import { importResearchSources, researchDatabasePath } from '../src/lib/server/research-store.ts';

const [releaseManifestPath, humanRatingsPath] = process.argv.slice(2);
if (!releaseManifestPath || !humanRatingsPath) {
	console.error('Usage: node scripts/importResearch.mjs RELEASE_MANIFEST.json HUMAN_RATINGS.csv');
	process.exitCode = 2;
} else {
	try {
		const result = await importResearchSources({
			databasePath: researchDatabasePath(),
			releaseManifestPath,
			humanRatingsPath
		});
		console.log(JSON.stringify({ databasePath: researchDatabasePath(), ...result }, null, 2));
	} catch (error) {
		console.error(error);
		process.exitCode = 1;
	}
}
