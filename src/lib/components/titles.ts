import type { TitleOption } from '$lib/types';

/** The guess list, fetched once per page load and shared by every guess box. */
let pending: Promise<TitleOption[]> | null = null;

export function loadTitles(): Promise<TitleOption[]> {
	if (!pending) {
		pending = fetch('/api/titles')
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json() as Promise<[number, string, number | null][]>;
			})
			.then((rows) => rows.map(([id, title, year]) => ({ id, title, year })))
			.catch((err) => {
				pending = null;
				throw err;
			});
	}
	return pending;
}

/** Lowercase, no accents, punctuation as spaces: "Amélie" and "amelie", "Se7en" and "se7en". */
export function normalise(s: string): string {
	return s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

export interface Indexed extends TitleOption {
	key: string;
	words: string[];
}

export function index(list: TitleOption[]): Indexed[] {
	return list.map((t) => {
		const key = normalise(t.title);
		return { ...t, key, words: key.split(' ') };
	});
}

/**
 * Every typed word must start a word of the title ("dark kni" finds The Dark Knight). Ranked:
 * whole-title prefix first, then titles that skip a leading "the"/"a", then the rest; shorter
 * titles before longer.
 */
export function search(all: Indexed[], q: string, limit = 8): Indexed[] {
	const terms = normalise(q).split(' ').filter(Boolean);
	if (!terms.length) return [];
	const joined = terms.join(' ');
	const scored: { t: Indexed; s: number }[] = [];
	for (const t of all) {
		if (!terms.every((term) => t.words.some((w) => w.startsWith(term)))) continue;
		let s = t.key.length / 100;
		if (t.key.startsWith(joined)) s -= 3;
		else if (t.key.replace(/^(the|a|an) /, '').startsWith(joined)) s -= 2;
		else if (t.key.includes(joined)) s -= 1;
		scored.push({ t, s });
	}
	return scored
		.sort((a, b) => a.s - b.s)
		.slice(0, limit)
		.map((x) => x.t);
}
