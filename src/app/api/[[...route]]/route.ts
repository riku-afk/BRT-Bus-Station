/**
 * Next -> Hono bridge. The only Next route handler for the API: everything under /api/*
 * is served by the embedded Hono app in src/server.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = async (request: Request) => {
  // Loaded on demand so server-only modules stay out of Next's client analysis.
  const { api } = await import('../../../server');
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  return api.fetch(new Request(url, request));
};

export {
  handler as DELETE,
  handler as GET,
  handler as HEAD,
  handler as OPTIONS,
  handler as PATCH,
  handler as POST,
  handler as PUT,
};
