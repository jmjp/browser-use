/** @type {import('@sveltejs/kit').Reroute} */
export function reroute({ url }) {
	if (url.pathname === '/index.html' || url.pathname === '/index.html/') {
		return '/';
	}
}
