// beacon-web: runs only when no file matches the request (see wrangler.toml).
// "/" and any folder path get that folder's index.html, as GitHub Pages does; anything else is 404.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/")) {
      url.pathname += "index.html";
      const r = await env.ASSETS.fetch(new Request(url, request));
      if (r.status !== 404) return r;
    }
    return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain" } });
  },
};
