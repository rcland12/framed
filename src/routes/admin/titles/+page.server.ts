import {
	TITLE_FILTERS,
	TITLE_SORTS,
	listTitles,
	type TitleFilter,
	type TitleSort
} from '$lib/server/admin';

const PER_PAGE = 48;

export async function load({ url }) {
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
	const f = url.searchParams.get('filter') as TitleFilter;
	const filter: TitleFilter = TITLE_FILTERS.includes(f) ? f : 'all';
	const s = url.searchParams.get('sort') as TitleSort;
	const sort: TitleSort = TITLE_SORTS.includes(s) ? s : 'title';
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const { rows, total } = await listTitles({ q, filter, sort, page, perPage: PER_PAGE });
	return {
		rows,
		total,
		q,
		filter,
		sort,
		page,
		pages: Math.max(1, Math.ceil(total / PER_PAGE)),
		filters: TITLE_FILTERS,
		sorts: TITLE_SORTS
	};
}
