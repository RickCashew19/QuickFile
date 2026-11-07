const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { ALLOWED_CUSTOM_ENV_KEYS } = require('../config/constants');

/**
 * Resolves current .env file path (supports ENV_FILE when set, else backend/.env)
 */
function getEnvPath() {
  return process.env.ENV_FILE ? path.resolve(process.env.ENV_FILE) : path.resolve(__dirname, '../../.env');
}

/**
 * Format and sanitize an environment variable value for .env file storage.
 * Safely handles spaces, hash (#), single quotes, double quotes, backslashes, and literal \n.
 */
function formatEnvValue(value) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const str = String(value);

  // Reject actual line breaks (carriage return / newline) and null characters
  if (/[\r\n\0]/.test(str)) {
    const err = new Error('Validation error: Setting values cannot contain raw line breaks or null characters.');
    err.statusCode = 400;
    throw err;
  }

  // If simple with no special characters and no leading/trailing whitespace
  if (!/[ #'"\\`]/.test(str) && str.trim() === str) {
    return str;
  }

  // Strategy 1: Single quotes (preserves spaces, #, ", \, literal \n when no single quote inside)
  if (!str.includes("'")) {
    return `'${str}'`;
  }

  // Strategy 2: Backticks (preserves spaces, #, ', ", \, literal \n when no backtick inside)
  if (!str.includes('`')) {
    return `\`${str}\``;
  }

  // Strategy 3: Double quotes (for strings with single quotes/backticks but without double quotes or literal \n/\r)
  if (!str.includes('"') && !/\\n|\\r/.test(str)) {
    return `"${str}"`;
  }

  // Fallback to single quote wrapper
  return `'${str}'`;
}

/**
 * Writes allowlisted custom environment variables to .env with strict round-trip verification.
 * Pre-validates via dotenv.parse, writes atomically through temp file, and verifies saved content.
 */
function writeCustomEnvVars(updates = {}, resetKeys = [], targetEnvPath = null) {
  const envPath = targetEnvPath || getEnvPath();
  const validUpdates = {};
  const expectedRawValues = {};

  for (const [key, value] of Object.entries(updates)) {
    if (ALLOWED_CUSTOM_ENV_KEYS.includes(key)) {
      validUpdates[key] = formatEnvValue(value);
      expectedRawValues[key] = value === null || value === undefined ? '' : String(value);
    }
  }

  if (Array.isArray(resetKeys)) {
    for (const key of resetKeys) {
      if (ALLOWED_CUSTOM_ENV_KEYS.includes(key)) {
        validUpdates[key] = '';
        expectedRawValues[key] = '';
      }
    }
  }

  const modifiedKeys = Object.keys(validUpdates);
  if (modifiedKeys.length === 0) {
    const err = new Error('No valid allowlisted settings provided for update or reset.');
    err.statusCode = 400;
    throw err;
  }

  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  let lines = envContent.split(/\r?\n/);
  for (const [key, formattedVal] of Object.entries(validUpdates)) {
    let replaced = false;
    lines = lines.map((line) => {
      if (line.startsWith(`${key}=`)) {
        replaced = true;
        return `${key}=${formattedVal}`;
      }
      return line;
    });

    if (!replaced) {
      lines.push(`${key}=${formattedVal}`);
    }
  }

  const newEnvContent = lines.join('\n');

  // Pre-write Round-Trip Validation
  const preParsed = dotenv.parse(newEnvContent);
  for (const key of modifiedKeys) {
    const parsedVal = preParsed[key] !== undefined ? preParsed[key] : '';
    const expectedVal = expectedRawValues[key];
    if (parsedVal !== expectedVal) {
      const err = new Error(`Setting "${key}" cannot be safely round-tripped through .env formatting.`);
      err.statusCode = 400;
      throw err;
    }
  }

  // Atomic write via temporary file
  const tempPath = `${envPath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tempPath, newEnvContent, 'utf8');
  fs.renameSync(tempPath, envPath);

  // Post-write verification
  const postParsed = dotenv.parse(fs.readFileSync(envPath, 'utf8'));
  for (const key of modifiedKeys) {
    const parsedVal = postParsed[key] !== undefined ? postParsed[key] : '';
    const expectedVal = expectedRawValues[key];
    if (parsedVal !== expectedVal) {
      const err = new Error(`Saved setting "${key}" failed post-write verification.`);
      err.statusCode = 500;
      throw err;
    }
  }

  // Update in-memory process.env only after file write and verification succeed
  for (const key of modifiedKeys) {
    process.env[key] = expectedRawValues[key];
  }

  return { modifiedKeys, expectedRawValues };
}

module.exports = {
  getEnvPath,
  formatEnvValue,
  writeCustomEnvVars,
};

