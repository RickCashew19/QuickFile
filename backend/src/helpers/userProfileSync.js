const { User } = require('../models');

/**
 * Single source of truth for the User <-> CitizenProfile denormalization.
 *
 * CitizenProfile owns the structured name and contact number; User keeps a
 * display-name/phone mirror so auth payloads, audit logs and populate-heavy
 * reads never need an extra join. Every write path must go through this helper
 * so the mirror cannot drift.
 */

/**
 * Derive the User mirror fields from a profile (or profile-shaped plain object).
 * `phone` is always assigned — an empty profile number clears the mirror,
 * which the old inline sync skipped.
 */
function buildUserProfileMirror(profileLike = {}) {
  const full_name = [
    profileLike.first_name,
    profileLike.middle_name,
    profileLike.last_name,
    profileLike.suffix,
  ].filter(Boolean).join(' ');

  return { full_name, phone: profileLike.contact_number || '' };
}

/**
 * Push the current profile values onto the matching User document.
 * No-op (returns null) when the profile or its user no longer exists.
 */
async function syncUserFromProfile(profile, session = null) {
  if (!profile || !profile.user_id) return null;

  const user = await User.findById(profile.user_id).session(session || null);
  if (!user) return null;

  const mirror = buildUserProfileMirror(profile);
  let changed = false;
  for (const [key, value] of Object.entries(mirror)) {
    if (user[key] !== value) {
      user[key] = value;
      changed = true;
    }
  }
  if (changed) await user.save(session ? { session } : undefined);
  return user;
}

module.exports = { buildUserProfileMirror, syncUserFromProfile };
