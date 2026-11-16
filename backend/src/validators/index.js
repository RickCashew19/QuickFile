const emailValidator = require('./emailValidator');
const fileValidator = require('./fileValidator');
const formDataValidator = require('./formDataValidator');

module.exports = {
  ...emailValidator,
  ...fileValidator,
  ...formDataValidator,
  emailValidator,
  fileValidator,
  formDataValidator,
};
