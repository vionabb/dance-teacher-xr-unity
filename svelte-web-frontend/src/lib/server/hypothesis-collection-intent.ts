import type { HypothesisCollectionChange } from './research-store';

type CatalogEntry = { slug: string; title: string };
type Creation = { title: string; question: string; overview: string };
const COMMAND_START = '(?:^|[.;]\\s*|\\band\\s+)(?:please\\s+|can\\s+you\\s+)?';

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalized(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function pattern(value: string): string {
	return escapeRegExp(normalized(value)).replace(/ /g, '\\s+');
}

function namedTarget(message: string, entry: CatalogEntry, command: (target: string) => RegExp) {
	return [entry.title, entry.slug].some((name) => command(pattern(name)).test(message));
}

function authorizesChange(
	message: string,
	catalog: CatalogEntry[],
	change: HypothesisCollectionChange
) {
	const entry = catalog.find((item) => item.slug === change.slug);
	if (!entry) return false;
	if (change.kind === 'rename') {
		if (!change.value) return false;
		return namedTarget(
			message,
			entry,
			(target) =>
				new RegExp(
					`${COMMAND_START}(?:rename|retitle)\\s+["'“”]?${target}["'“”]?\\s+to\\s+["'“”]?${pattern(change.value!)}(?=["'“”]?(?:\\s|[,.!?;:]|$))`,
					'i'
				)
		);
	}
	if (change.kind === 'status') {
		if (!change.value) return false;
		return namedTarget(message, entry, (target) => {
			const status = pattern(change.value!);
			const explicit = `${COMMAND_START}(?:mark|set|move|change)\\s+["'“”]?${target}["'“”]?\\s+(?:status\\s+)?(?:as|to)\\s+${status}(?=\\b|$)`;
			const shortCommand =
				change.value === 'archived'
					? `|${COMMAND_START}archive\\s+["'“”]?${target}(?=["'“”]?(?:\\s|[,.!?;:]|$))`
					: change.value === 'resolved'
						? `|${COMMAND_START}resolve\\s+["'“”]?${target}(?=["'“”]?(?:\\s|[,.!?;:]|$))`
						: '';
			return new RegExp(`${explicit}${shortCommand}`, 'i');
		});
	}
	if (change.kind === 'remove')
		return namedTarget(
			message,
			entry,
			(target) =>
				new RegExp(
					`${COMMAND_START}(?:delete|remove|hide)\\s+["'“”]?${target}(?=["'“”]?(?:\\s|[,.!?;:]|$))`,
					'i'
				)
		);
	return namedTarget(
		message,
		entry,
		(target) =>
			new RegExp(
				`${COMMAND_START}(?:restore|undelete|unhide)\\s+["'“”]?${target}(?=["'“”]?(?:\\s|[,.!?;:]|$))`,
				'i'
			)
	);
}

export function authorizeCollectionOperations(input: {
	message: string;
	catalog: CatalogEntry[];
	create: Creation | null;
	changes: HypothesisCollectionChange[];
}): { create: Creation | null; changes: HypothesisCollectionChange[]; suppressed: boolean } {
	const message = normalized(input.message);
	const proposed = !!input.create || input.changes.length > 0;
	if (!proposed) return { create: null, changes: [], suppressed: false };
	// Discussion and hypothetical requests never write research state.
	if (
		/^(?:what|why|how|would|could|should)\b|\b(?:what if|if i|if we|hypothetically|suppose)\b/i.test(
			message
		)
	)
		return { create: null, changes: [], suppressed: true };
	const createAllowed =
		!input.create ||
		new RegExp(
			`${COMMAND_START}(?:add|create)\\s+(?:a\\s+|an\\s+|new\\s+)?hypothesis\\b`,
			'i'
		).test(message);
	const changesAllowed = input.changes.every((change) =>
		authorizesChange(message, input.catalog, change)
	);
	if (!createAllowed || !changesAllowed) return { create: null, changes: [], suppressed: true };
	return { create: input.create, changes: input.changes, suppressed: false };
}
