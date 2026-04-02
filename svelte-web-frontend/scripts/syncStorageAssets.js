import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({
	path: 'src/env/.env'
});

/**
 * Syncs storage assets to Supabase buckets.
 * @param {Object} args - The arguments for syncing storage assets.
 * @param {string} args.url - The URL of the Supabase project.
 * @param {string} args.key - The service role key for accessing Supabase.
 * @param {boolean} [args.makeSync=true] - Whether to perform the sync operation.
 * @param {boolean} [args.dryRun=false] - Whether to perform a dry run without actually syncing the files.
 * @returns {Promise<void>}
 */
async function syncStorageAssets(args) {
	const { url, key, makeSync = true, dryRun = false } = args;
	const supabase = createClient(url, key);

	// Sync:
	//   static/bundle/holistic_data (.csv) to supabase bucket: holisticdata
	//   static/bundle/thumbnails (.jpg) to supabase bucket: thumbnails
	//   static/bundle/pose2d_data (.csv) to supabase bucket: pose2ddata
	//   static/bundle/source_videos (.mp4 or .MP4) to supabase bucket: sourcevideos

	const syncFolders = [
		{
			folderPath: 'static/bundle/holistic_data',
			bucketName: 'holisticdata',
			allowedFileSuffixes: ['csv'],
			mimeType: 'text/csv'
		},
		{
			folderPath: 'static/bundle/thumbnails',
			bucketName: 'thumbnails',
			allowedFileSuffixes: ['jpg'],
			mimeType: 'image/jpeg'
		},
		{
			folderPath: 'static/bundle/pose2d_data',
			bucketName: 'pose2ddata',
			allowedFileSuffixes: ['csv'],
			mimeType: 'text/csv'
		},
		{
			folderPath: 'static/bundle/source_videos',
			bucketName: 'sourcevideos',
			allowedFileSuffixes: ['mp4', 'MP4'],
			mimeType: 'video/mp4'
		}
	];

	const existingBuckets = await supabase.storage.listBuckets();
	if (existingBuckets.error) {
		console.error('Error listing buckets:', existingBuckets.error);
		return;
	}

	const syncFolderPromises = syncFolders.map(async (args) => {
		// create bucket if not exists
		let bucketDoesntExist = false;
		if (undefined === existingBuckets.data.find((x) => x.name === args.bucketName)) {
			if (dryRun) {
				console.log(`⚠️ Dry run: Bucket ${args.bucketName} would be created`);
				bucketDoesntExist = true;
			} else {
				await supabase.storage
					.createBucket(args.bucketName, {
						public: true,
						allowedMimeTypes: [args.mimeType]
					})
					.then(() => console.log(`✅ Bucket ${args.bucketName} created successfully`))
					.catch((error) => console.error('❌ Error creating bucket:', error));
			}
		} else {
			console.log(`ℹ️ Bucket ${args.bucketName} already exists`);
		}

		const syncPromise = syncFolderToBucket({
			supabase,
			folderPath: args.folderPath,
			bucketName: args.bucketName,
			allowedFileSuffixes: args.allowedFileSuffixes,
			mimeType: args.mimeType,
			makeSync: makeSync,
			dryRun: dryRun,
			dryRunBucketDoesntExist: bucketDoesntExist,
			printIndent: '    '
		});
		if (!makeSync) {
			return syncPromise.then((x) => [...x, bucketDoesntExist ? 1 : 0]);
		}
		return [...(await syncPromise), bucketDoesntExist ? 1 : 0];
	});
	const fileStatistics = await Promise.all(syncFolderPromises);
	const totalFilesSynced = fileStatistics.reduce((acc, val) => acc + val[0], 0);
	const totalFilesSkipped = fileStatistics.reduce((acc, val) => acc + val[1], 0);
	const totalBucketsCreated = fileStatistics.reduce((acc, val) => acc + val[2], 0);

	const wouldHave = dryRun ? '⚠️ would have ' : '';
	console.log(
		`🚀 ${dryRun ? '⚠️ Would have synced' : 'Synced'} ${totalFilesSynced} files, skipped ${totalFilesSkipped} files, ${wouldHave}created ${totalBucketsCreated} buckets`
	);
}

/**
 * Syncs a folder to a Supabase storage bucket.
 * @param {Object} args - The arguments for syncing a folder to a bucket.
 * @param {SupabaseClient} args.supabase - The Supabase client.
 * @param {string} args.folderPath - The path of the folder to sync.
 * @param {string} args.bucketName - The name of the bucket to sync to.
 * @param {string[]} args.allowedFileSuffixes - The allowed file suffixes.
 * @param {string} [args.mimeType] - The MIME type of the files.
 * @param {string} [args.prefix] - The prefix to add to the file paths.
 * @param {string} args.printIndent - The indentation for logging.
 * @param {boolean} [args.makeSync=false] - Whether to perform the sync operation.
 * @param {boolean} [args.dryRun=false] - Whether to perform a dry run without actually syncing the files.
 * @param {boolean} [args.dryRunBucketDoesntExist=false] - In dry run mode, whether to simulate that the bucket doesn't exist.
 * @returns {Promise<[number, number]>} - A promise that resolves to an array containing the number of files synced and skipped.
 */
async function syncFolderToBucket(args) {
	let filesSynced = 0;
	let filesSkipped = 0;

	args.prefix = args.prefix ?? '';
	args.printIndent = args.printIndent ?? '';
	args.makeSync = args.makeSync ?? false;
	args.dryRun = args.dryRun ?? false;

	// Get all files in folder
	const directoryContents = fs.readdirSync(args.folderPath, { withFileTypes: true });

	let bucketContents = args.dryRunBucketDoesntExist
		? { data: [], error: undefined }
		: await args.supabase.storage.from(args.bucketName).list(args.prefix);

	if (bucketContents.error) {
		console.error(`${args.printIndent}Error listing bucket contents:`, bucketContents.error);
		return;
	}

	// Loop through files
	const files = directoryContents.filter((dirent) => dirent.isFile());
	for (const file of files) {
		// Check if file has allowed suffix
		const fileSuffix = file.name.split('.').pop();

		if (
			args.allowedFileSuffixes &&
			(!fileSuffix || !args.allowedFileSuffixes.includes(fileSuffix))
		) {
			// Skip file if it doesn't have an allowed suffix
			continue;
		}

		// Upload file to bucket with prefix
		const fileBucketPath = `${args.prefix}${file.name}`;

		// Skip if the file is already uploaded
		const existingFile = bucketContents.data.find((item) => item.name === file.name);
		if (existingFile) {
			// console.log(`ℹ️ File ${fileBucketPath} already exists in bucket: ${args.bucketName}`);
			filesSkipped += 1;
			continue;
		}

		if (args.dryRun) {
			console.log(
				`${args.printIndent}⚠️ Dry run: File ${fileBucketPath} would be uploaded to bucket: ${args.bucketName}`
			);
			filesSynced += 1;
			continue;
		}

		// Upload file
		const { data, error } = await args.supabase.storage
			.from(args.bucketName)
			.upload(fileBucketPath, fs.readFileSync(`${args.folderPath}/${file.name}`), {
				contentType: args.mimeType
			});

		if (error) {
			console.error(`${args.printIndent}❌ Error uploading file:`, error);
		} else {
			console.log(
				`${args.printIndent}⬆️ File ${data.path} uploaded successfully to bucket: ${args.bucketName}`
			);
			filesSynced += 1;
		}
	}

	// Recurse on all subfolders
	const subfolders = directoryContents.filter((dirent) => dirent.isDirectory());
	const subfolderPromises = subfolders.map(async (subfolder) => {
		const subfolderPromise = syncFolderToBucket({
			supabase: args.supabase,
			folderPath: `${args.folderPath}/${subfolder.name}`,
			bucketName: args.bucketName,
			allowedFileSuffixes: args.allowedFileSuffixes,
			prefix: `${args.prefix}${subfolder.name}/`,
			mimeType: args.mimeType,
			printIndent: `${args.printIndent}    `,
			makeSync: args.makeSync,
			dryRun: args.dryRun,
			dryRunBucketDoesntExist: args.dryRunBucketDoesntExist
		});
		if (args.makeSync) {
			return await subfolderPromise;
		}
		return subfolderPromise;
	});
	const filesSyncedInSubfolders = await Promise.all(subfolderPromises);
	filesSynced += filesSyncedInSubfolders.reduce((acc, val) => acc + val[0], 0);
	filesSkipped += filesSyncedInSubfolders.reduce((acc, val) => acc + val[1], 0);
	console.log(
		`${args.printIndent}✅ Folder ${args.folderPath} synced to bucket: ${args.bucketName} (${filesSynced} files synced, ${filesSkipped} files skipped)`
	);

	return [filesSynced, filesSkipped];
}

/**
 * Entry point of the script.
 * @returns {Promise<void>}
 */
async function main() {
	const dryRun = process.argv.includes('--dry-run');
	const onProduction = process.argv.includes('--production');
	const async = process.argv.includes('--async');

	const url = onProduction
		? process.env.PRODUCTION_SUPABASE_URL
		: process.env.NEXT_PUBLIC_SUPABASE_URL;
	let key = onProduction
		? process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY
		: process.env.SUPABASE_SERVICE_ROLE_KEY;

	await syncStorageAssets({
		url: url,
		key: key,
		makeSync: !async,
		dryRun: dryRun
	});
}

await main();
