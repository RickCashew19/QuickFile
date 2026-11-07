const { User, CitizenProfile, DocumentType, AuditLog } = require('../../models');

const PROFILE_COMPLETENESS_FIELDS = [
  'first_name',
  'last_name',
  'birthdate',
  'gender',
  'civil_status',
  'contact_number',
  'purok_zone',
  'street_address',
  'barangay',
  'city',
  'province',
  'occupation',
  'voter_status',
  'emergency_contact_name',
  'emergency_contact_number',
  'valid_id_type',
  'valid_id_number',
];

/**
 * Calculates profile completeness score (0-100%)
 */
function calculateCompletenessScore(profile) {
  if (!profile) return 0;
  let filledCount = 0;

  for (const field of PROFILE_COMPLETENESS_FIELDS) {
    const val = profile[field];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      filledCount += 1;
    }
  }

  return Math.round((filledCount / PROFILE_COMPLETENESS_FIELDS.length) * 100);
}

/**
 * Retrieves citizen profile with completeness score
 */
async function getCitizenProfile(userId) {
  const profile = await CitizenProfile.findOne({ user_id: userId });
  if (!profile) {
    const error = new Error('Citizen profile not found.');
    error.statusCode = 404;
    throw error;
  }

  const completenessScore = calculateCompletenessScore(profile);

  return {
    profile,
    completeness_score: completenessScore,
  };
}

/**
 * Updates citizen profile and keeps User full_name and phone in sync
 */
async function updateCitizenProfile(userId, updateData, ipAddress, userAgent) {
  const profile = await CitizenProfile.findOne({ user_id: userId });
  if (!profile) {
    const error = new Error('Citizen profile not found.');
    error.statusCode = 404;
    throw error;
  }

  const updatableFields = [
    'first_name',
    'middle_name',
    'last_name',
    'suffix',
    'birthdate',
    'gender',
    'civil_status',
    'contact_number',
    'purok_zone',
    'street_address',
    'barangay',
    'city',
    'province',
    'occupation',
    'voter_status',
    'emergency_contact_name',
    'emergency_contact_number',
    'valid_id_type',
    'valid_id_number',
    'proof_of_residency_type',
  ];

  for (const field of updatableFields) {
    if (updateData[field] !== undefined) {
      if (field === 'birthdate') {
        profile.birthdate = new Date(updateData.birthdate);
      } else {
        profile[field] = typeof updateData[field] === 'string' ? updateData[field].trim() : updateData[field];
      }
    }
  }

  // Mark profile complete once required birthdate & gender are provided
  if (profile.birthdate && profile.gender) {
    profile.profile_complete = true;
  }

  await profile.save();

  // Sync with User model: full_name and phone
  const fullNameParts = [profile.first_name, profile.middle_name, profile.last_name, profile.suffix].filter(Boolean);
  const fullName = fullNameParts.join(' ');
  const primaryPhone = profile.contact_number || '';

  const user = await User.findById(userId);
  if (user) {
    user.full_name = fullName;
    if (primaryPhone) {
      user.phone = primaryPhone;
    }
    await user.save();
  }

  // Audit log entry
  await AuditLog.create({
    user_id: userId,
    actor_name: fullName,
    action: 'CITIZEN_PROFILE_UPDATE',
    module: 'CITIZEN',
    target_id: profile._id.toString(),
    target_type: 'CitizenProfile',
    details: { updated_fields: Object.keys(updateData) },
    ip_address: ipAddress || '',
    user_agent: userAgent || '',
  });

  const completenessScore = calculateCompletenessScore(profile);

  return {
    profile,
    completeness_score: completenessScore,
  };
}

/**
 * Returns pre-fill data for document request forms
 */
async function getProfileReuseData(userId) {
  const profile = await CitizenProfile.findOne({ user_id: userId });
  if (!profile) {
    const error = new Error('Citizen profile not found.');
    error.statusCode = 404;
    throw error;
  }

  const user = await User.findById(userId);

  return {
    full_name: user ? user.full_name : profile.full_name,
    first_name: profile.first_name,
    middle_name: profile.middle_name,
    last_name: profile.last_name,
    suffix: profile.suffix,
    birthdate: profile.birthdate,
    gender: profile.gender,
    civil_status: profile.civil_status,
    contact_number: profile.contact_number,
    purok_zone: profile.purok_zone,
    street_address: profile.street_address,
    barangay: profile.barangay,
    city: profile.city,
    province: profile.province,
    occupation: profile.occupation,
    voter_status: profile.voter_status,
    emergency_contact_name: profile.emergency_contact_name,
    emergency_contact_number: profile.emergency_contact_number,
    valid_id_type: profile.valid_id_type,
    valid_id_number: profile.valid_id_number,
  };
}

/**
 * Returns active document types for citizen document catalog
 */
async function getActiveCatalog() {
  const documentTypes = await DocumentType.find({ is_active: true }).sort({ name: 1 }).lean();
  return documentTypes;
}

module.exports = {
  calculateCompletenessScore,
  getCitizenProfile,
  updateCitizenProfile,
  getProfileReuseData,
  getActiveCatalog,
};

