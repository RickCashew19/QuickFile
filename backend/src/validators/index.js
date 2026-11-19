const emailValidator = require('./emailValidator');
const fileValidator = require('./fileValidator');
const formDataValidator = require('./formDataValidator');
const passwordValidator = require('./passwordValidator');

module.exports = {
  ...emailValidator,
  ...fileValidator,
  ...formDataValidator,
  ...passwordValidator,
  emailValidator,
  fileValidator,
  formDataValidator,
  passwordValidator,
};
