/**
 * Default caching policy for API responses.
 *
 * QuickFile responses are user-specific and frequently contain personal data,
 * so GET responses are marked private and non-storable unless a route sets its
 * own Cache-Control header (for example, Swagger UI assets or file downloads).
 */
function cacheControlHeaders(req, res, next) {
  const isDocsAsset = req.path.startsWith('/docs') || req.path === '/openapi.json';
  if (req.method === 'GET' && !isDocsAsset && !res.getHeader('Cache-Control')) {
    res.setHeader('Cache-Control', 'private, no-store');
  }
  next();
}

module.exports = { cacheControlHeaders };
