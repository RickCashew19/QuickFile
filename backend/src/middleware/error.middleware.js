const { notFoundHandler } = require('./notFound.middleware');
const { errorHandler } = require('./errorHandler.middleware');

module.exports = {
  notFoundHandler,
  errorHandler,
};
