/**
 * Seeds the Atlas `quickfile` database with a complete, repeatable demo dataset.
 *
 * This is the Atlas counterpart of `npm run seed:demo` (which is deliberately
 * restricted to local MongoDB). It runs the standard demo seeder — requests in
 * every workflow status, issued certificates, notifications and audit logs —
 * and then adds the Atlas-only extras: signatory settings so certificates can
 * be printed, plus a custom DOCX template so template management and Word
 * download can be exercised in the UI.
 *
 * Safe to re-run: all inserts are keyed by stable demo identifiers.
 *
 * Usage:
 *   npm run seed:demo:atlas
 */
process.env.DEMO_SEED_ALLOW_ATLAS = 'true';

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { config } = require('../src/config');
const { connectDB } = require('../src/config/db');
const {
  AppSetting,
  DocumentType,
  DocumentTemplate,
  DocumentRequest,
  IssuedDocument,
  User,
} = require('../src/models');
const documentTemplatesService = require('../src/services/documentTemplates.service');
const { seedDemoData } = require('../src/helpers/demoSeeder');

const DEMO_PURPOSE_PREFIX = 'DEMO DATA - QuickFile sample set v1:';

// Signatories are required before the built-in certificate layout can print.
const DEMO_SETTINGS = [
  {
    key: 'barangay_captain',
    value: 'Hon. Juan D. Cruz',
    category: 'general',
    description: 'Name of the Barangay Captain (Punong Barangay)',
  },
  {
    key: 'barangay_secretary',
    value: 'Maria L. Reyes',
    category: 'general',
    description: 'Name of the Barangay Secretary',
  },
];

async function seedSignatorySettings() {
  for (const setting of DEMO_SETTINGS) {
    await AppSetting.updateOne(
      { key: setting.key },
      {
        $set: {
          value: setting.value,
          category: setting.category,
          description: setting.description,
        },
      },
      { upsert: true }
    );
  }
  console.log('[AtlasDemo] Signatory settings ready for certificate printing.');
}

async function seedCustomTemplate(admin) {
  const docType = await DocumentType.findOne({ code: 'BC' });
  if (!docType || !admin) return null;

  let activeTemplate = docType.active_template_id
    ? await DocumentTemplate.findById(docType.active_template_id)
    : null;

  if (!activeTemplate) {
    const existingCount = await DocumentTemplate.countDocuments({ document_type_id: docType._id });
    if (existingCount === 0) {
      const buffer = await documentTemplatesService.getStarterTemplateBuffer();
      const uploaded = await documentTemplatesService.uploadTemplate(
        docType._id,
        { buffer, originalname: 'quickfile-demo-certificate.docx' },
        admin,
        '127.0.0.1',
        'AtlasDemoSeeder'
      );
      if (!uploaded.stored) {
        throw new Error('[AtlasDemo] Starter DOCX template failed validation.');
      }
      await documentTemplatesService.activateTemplate(
        docType._id,
        uploaded.template.version,
        admin,
        '127.0.0.1',
        'AtlasDemoSeeder'
      );
    }
    activeTemplate = await DocumentTemplate.findOne({ document_type_id: docType._id, is_active: true });
  }

  if (!activeTemplate) return null;

  // Give one built-in-issued demo certificate an active custom template so the
  // "Download official Word template" action has real data to work with.
  const demoRequestIds = await DocumentRequest.find({
    document_type_id: docType._id,
    purpose: { $regex: `^${DEMO_PURPOSE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` },
  }).distinct('_id');
  const issued = await IssuedDocument.findOne({
    request_id: { $in: demoRequestIds },
    template_id: null,
  });
  if (issued) {
    issued.template_id = activeTemplate._id;
    issued.template_version = activeTemplate.version;
    await issued.save();
  }

  console.log(`[AtlasDemo] Active custom template v${activeTemplate.version} ready for ${docType.code}.`);
  return activeTemplate;
}

async function main() {
  if (config.isProduction) {
    throw new Error('[AtlasDemo] Refusing to seed demo data when NODE_ENV=production.');
  }

  await connectDB();

  // Settings first so demo certificates are rendered with signatory names.
  await seedSignatorySettings();
  await seedDemoData();

  const admin = await User.findOne({ role: 'admin' });
  await seedCustomTemplate(admin);

  const [statusCounts, certificates] = await Promise.all([
    DocumentRequest.aggregate([
      { $match: { purpose: { $regex: `^${DEMO_PURPOSE_PREFIX}` } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    IssuedDocument.find({ request_id: { $in: await DocumentRequest.find({
      purpose: { $regex: `^${DEMO_PURPOSE_PREFIX}` },
    }).distinct('_id') } })
      .select('certificate_number verification_code validity_status')
      .lean(),
  ]);

  console.log(
    JSON.stringify(
      {
        database: mongoose.connection.name,
        demo_status_counts: Object.fromEntries(statusCounts.map((row) => [row._id, row.count])),
        demo_certificates: certificates.map((c) => ({
          certificate_number: c.certificate_number,
          verification_code: c.verification_code,
          validity_status: c.validity_status,
        })),
        demo_accounts: [config.seed.adminEmail, config.seed.staffEmail, config.seed.citizenEmail],
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error('[AtlasDemo] Failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
