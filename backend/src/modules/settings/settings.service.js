const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { config } = require('../../config');
const { ALLOWED_CUSTOM_ENV_KEYS } = require('../../config/constants');
const { AppSetting, AuditLog } = require('../../models');
const { verifySuperAdminKey } = require('../../utils/superAdminKeyVerifier');

/**
 * Resolves current .env file path (supports test override)
 */
function getEnvPath() {
  return process.env.TEST_ENV_PATH || path.resolve(__dirname, '../../../.env');
}

/**
 * Format and sanitize an environment variable value for .env
 * Safely preserves spaces, #, quotes, backslashes, and literal \n
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

  // Default to single quote (round-trip check will validate or reject)
  return `'${str}'`;
}

/**
 * Retrieve current settings with masked integration secrets
 */
async function getSettings() {
  const integrationSummary = config.getSafeIntegrationSummary();
  const appSettings = await AppSetting.find({}).lean();

  return {
    integrations: integrationSummary,
    app_settings: appSettings,
  };
}

/**
 * Updates allowlisted CUSTOM_* variables in .env and runtime memory
 * Strict round-trip validation with dotenv.parse before and after writing.
 * process.env is updated ONLY after the file write succeeds.
 */
async function updateCustomSettings({ suAdminKey, updates = {}, resetKeys = [], actorUser, ipAddress, userAgent }) {
  if (!suAdminKey) {
    const err = new Error('Super Admin Key is required to save integration settings.');
    err.statusCode = 400;
    throw err;
  }

  // 1. Verify Super Admin Key (timing-safe + lockout protection)
  await verifySuperAdminKey({
    providedKey: suAdminKey,
    actorId: actorUser._id,
    actorName: actorUser.full_name,
    ipAddress,
    userAgent,
  });

  const validUpdates = {};
  const expectedRawValues = {};

  // Process updates
  for (const [key, value] of Object.entries(updates)) {
    if (ALLOWED_CUSTOM_ENV_KEYS.includes(key)) {
      const formatted = formatEnvValue(value);
      validUpdates[key] = formatted;
      expectedRawValues[key] = value === null || value === undefined ? '' : String(value);
    }
  }

  // Process resetKeys (resetting custom key back to empty string / default)
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

  // 2. Read existing .env file
  const envPath = getEnvPath();
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

  // 3. Pre-write Round-Trip Validation via dotenv.parse
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

  // 4. Write atomically via temporary file
  const tempPath = `${envPath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tempPath, newEnvContent, 'utf8');
  fs.renameSync(tempPath, envPath);

  // 5. Post-write Verification on the actual saved file
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

  // 6. Update in-memory process.env ONLY AFTER file write and verification succeed
  for (const key of modifiedKeys) {
    process.env[key] = expectedRawValues[key];
  }

  // 7. Audit settings modification (never log secrets!)
  await AuditLog.create({
    user_id: actorUser._id,
    actor_name: actorUser.full_name,
    action: 'SETTINGS_UPDATE_CUSTOM_KEYS',
    module: 'SETTINGS',
    target_type: 'AppConfig',
    details: { modified_keys: modifiedKeys },
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  return {
    modified_keys: modifiedKeys,
    integrations: config.getSafeIntegrationSummary(),
  };
}

module.exports = {
  getSettings,
  updateCustomSettings,
  formatEnvValue,
};
