function errorHandler(err, req, res, next) {
  console.error('[QuickFile Error]', err);

  const statusCode = err.status || 500;
  const message = err.message || 'Internal Server Error';

  if (req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
    return res.status(statusCode).json({
      success: false,
      message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }

  res.status(statusCode).render('layouts/error', {
    title: 'An Error Occurred',
    message,
    statusCode
  });
}

module.exports = {
  errorHandler
};
