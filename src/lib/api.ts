/** POSTs JSON and returns the parsed reply; a non-2xx becomes an Error with the server's message. */
export async function post<T>(url: string, body: unknown = {}): Promise<T> {
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	const data = await res.json().catch(() => null);
	if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
	return data as T;
}
