const mongoose = require('mongoose');
const { config } = require('../config');
const { connectDB } = require('../config/db');
const {
  AppSetting,
  AuditLog,
  CitizenProfile,
  DocumentRequest,
  DocumentType,
  IssuedDocument,
  User,
} = require('../models');
const { ROLES, REQUEST_STATUSES, PAYMENT_STATUSES, VALIDITY_STATUSES } = require('../config/constants');
const { createRequest } = require('../modules/request/request.service');
const { transitionRequestStatus } = require('../modules/request/requestTransition');
const staffService = require('../modules/staff/staff.service');
const { seedDatabase } = require('./seeder');
const {
  generateUniqueCertificateNumber,
  generateVerificationCode,
  generateQrCodeDataUrl,
} = require('./certificateGenerator');
const { buildRenderData } = require('./templatePlaceholders');

const DEMO_PURPOSE_PREFIX = 'DEMO DATA - QuickFile sample set v1:';

const DEMO_CASES = [
  {
    key: 'pending-employment',
    purpose: `${DEMO_PURPOSE_PREFIX} Employment application`,
    documentCode: 'BC',
    targetStatus: REQUEST_STATUSES.PENDING,
  },
  {
    key: 'under-review-residency',
    purpose: `${DEMO_PURPOSE_PREFIX} School enrollment residency proof`,
    documentCode: 'COR',
    targetStatus: REQUEST_STATUSES.UNDER_REVIEW,
  },
  {
    key: 'in-preparation-indigency',
    purpose: `${DEMO_PURPOSE_PREFIX} Scholarship application`,
    documentCode: 'COI',
    targetStatus: REQUEST_STATUSES.IN_PREPARATION,
  },
  {
    key: 'ready-clearance',
    purpose: `${DEMO_PURPOSE_PREFIX} Local employment clearance`,
    documentCode: 'BC',
    targetStatus: REQUEST_STATUSES.READY_FOR_PICKUP,
  },
  {
    key: 'released-business',
    purpose: `${DEMO_PURPOSE_PREFIX} Small business registration`,
    documentCode: 'BUS-CLR',
    targetStatus: REQUEST_STATUSES.RELEASED,
  },
  {
    key: 'rejected-residency',
    purpose: `${DEMO_PURPOSE_PREFIX} Residency request needing additional proof`,
    documentCode: 'COR',
    targetStatus: REQUEST_STATUSES.REJECTED,
  },
  {
    key: 'archived-indigency',
    purpose: `${DEMO_PURPOSE_PREFIX} Completed medical assistance request`,
    documentCode: 'COI',
    targetStatus: REQUEST_STATUSES.ARCHIVED,
  },
];

function assertSafeDemoDatabase() {
  if (config.isProduction) {
    throw new Error('[DemoSeeder] Refusing to insert demo data when NODE_ENV=production.');
  }

  let parsedUri;
  try {
    parsedUri = new URL(config.mongoUri);
  } catch {
    throw new Error('[DemoSeeder] MONGO_URI must point to a local QuickFile development database.');
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  const databaseName = decodeURIComponent(parsedUri.pathname.replace(/^\//, '').split('/')[0] || '');
  if (
    parsedUri.protocol !== 'mongodb:' ||
    !localHosts.has(parsedUri.hostname.toLowerCase()) ||
    !['quickfile', 'quickfile_demo'].includes(databaseName.toLowerCase())
  ) {
    throw new Error('[DemoSeeder] Only local MongoDB databases named quickfile or quickfile_demo are allowed.');
  }
}

async function ensurePrepared(request, staff) {
  if (request.status === REQUEST_STATUSES.PENDING) {
    request = await transitionRequestStatus({
      request,
      newStatus: REQUEST_STATUSES.UNDER_REVIEW,
      actorUser: staff,
    });
  }
  if (request.status === REQUEST_STATUSES.UNDER_REVIEW) {
    request = await transitionRequestStatus({
      request,
      newStatus: REQUEST_STATUSES.APPROVED,
      actorUser: staff,
    });
  }
  if (request.status === REQUEST_STATUSES.APPROVED) {
    request = await transitionRequestStatus({
      request,
      newStatus: REQUEST_STATUSES.IN_PREPARATION,
      actorUser: staff,
    });
  }
  return request;
}

async function ensureDemoCertificate(request, staff) {
  let issuedDocument = await IssuedDocument.findOne({ request_id: request._id });
  if (!issuedDocument) {
    const populatedRequest = await DocumentRequest.findById(request._id)
      .populate('document_type_id')
      .populate('citizen_id');
    const citizenProfile = await CitizenProfile.findOne({ user_id: populatedRequest.citizen_id._id }).lean();
    const appSettings = await AppSetting.find({}).lean();
    const settings = Object.fromEntries(appSettings.map((setting) => [setting.key, setting.value]));
    const issuedAt = new Date();
    const expiresAt =
      config.certificateValidityDays > 0
        ? new Date(issuedAt.getTime() + config.certificateValidityDays * 24 * 60 * 60 * 1000)
        : null;
    const certificateNumber = await generateUniqueCertificateNumber(populatedRequest.document_type_id.code);
    const verificationCode = generateVerificationCode();
    const qrData = `${config.publicAppUrl}/verify/${verificationCode}`;
    const qrCodeImage = await generateQrCodeDataUrl(qrData);
    const renderData = buildRenderData({
      citizen: populatedRequest.citizen_id,
      citizenProfile,
      request: populatedRequest,
      documentType: populatedRequest.document_type_id,
      settings,
      issuedDocument: { certificate_number: certificateNumber, verification_code: verificationCode, qr_data: qrData, issued_at: issuedAt, expires_at: expiresAt },
    });

    issuedDocument = await IssuedDocument.create({
      request_id: request._id,
      certificate_number: certificateNumber,
      document_name: populatedRequest.document_type_id.name,
      issued_to_name: populatedRequest.citizen_id.full_name,
      verification_code: verificationCode,
      qr_data: qrData,
      qr_code_image: qrCodeImage,
      issued_by: staff._id,
      issued_at: issuedAt,
      validity_status: VALIDITY_STATUSES.VALID,
      expires_at: expiresAt,
      render_data: renderData,
    });
  }

  if (request.status === REQUEST_STATUSES.IN_PREPARATION) {
    request = await transitionRequestStatus({
      request,
      newStatus: REQUEST_STATUSES.READY_FOR_PICKUP,
      actorUser: staff,
    });
  }
  return { request, issuedDocument };
}

async function advanceDemoCase(request, demoCase, staff) {
  if (demoCase.targetStatus === REQUEST_STATUSES.PENDING) return request;

  if (demoCase.targetStatus === REQUEST_STATUSES.UNDER_REVIEW) {
    if (request.status === REQUEST_STATUSES.PENDING) {
      request = await transitionRequestStatus({
        request,
        newStatus: REQUEST_STATUSES.UNDER_REVIEW,
        actorUser: staff,
      });
    }
    return request;
  }

  if (demoCase.targetStatus === REQUEST_STATUSES.REJECTED) {
    if (request.status === REQUEST_STATUSES.PENDING) {
      request = await transitionRequestStatus({
        request,
        newStatus: REQUEST_STATUSES.UNDER_REVIEW,
        actorUser: staff,
      });
    }
    if (request.status === REQUEST_STATUSES.UNDER_REVIEW) {
      request = await transitionRequestStatus({
        request,
        newStatus: REQUEST_STATUSES.REJECTED,
        rejectionReason: 'DEMO DATA: Additional proof of residency is required.',
        actorUser: staff,
      });
    }
    return request;
  }

  request = await ensurePrepared(request, staff);
  if (demoCase.targetStatus === REQUEST_STATUSES.IN_PREPARATION) return request;

  const { request: readyRequest, issuedDocument } = await ensureDemoCertificate(request, staff);
  request = readyRequest;

  if ([REQUEST_STATUSES.RELEASED, REQUEST_STATUSES.ARCHIVED].includes(demoCase.targetStatus)) {
    if (request.status === REQUEST_STATUSES.READY_FOR_PICKUP) {
      const paymentData =
        request.fee > 0
          ? { payment_status: PAYMENT_STATUSES.PAID, payment_reference: `DEMO-${issuedDocument.certificate_number}` }
          : {};
      request = await staffService.releaseRequest(request._id, paymentData, staff);
    }
    if (request.status === REQUEST_STATUSES.RELEASED && demoCase.targetStatus === REQUEST_STATUSES.ARCHIVED) {
      request = await staffService.archiveRequest(request._id, staff);
    }
  }

  return request;
}

async function seedDemoData() {
  assertSafeDemoDatabase();
  await connectDB();
  await seedDatabase();

  const [citizen, staff] = await Promise.all([
    User.findOne({ email: config.seed.citizenEmail.toLowerCase(), role: ROLES.CITIZEN }),
    User.findOne({ email: config.seed.staffEmail.toLowerCase(), role: ROLES.STAFF }),
  ]);
  if (!citizen || !staff) {
    throw new Error('[DemoSeeder] Default demo citizen or staff account is missing after base seeding.');
  }

  const documentTypes = await DocumentType.find({
    code: { $in: [...new Set(DEMO_CASES.map((sample) => sample.documentCode))] },
    is_active: true,
  });
  const documentTypesByCode = new Map(documentTypes.map((docType) => [docType.code, docType]));
  const missingCodes = DEMO_CASES.map((sample) => sample.documentCode).filter((code) => !documentTypesByCode.has(code));
  if (missingCodes.length) {
    throw new Error(`[DemoSeeder] Active document types missing: ${[...new Set(missingCodes)].join(', ')}.`);
  }

  const result = [];
  for (const demoCase of DEMO_CASES) {
    let request = await DocumentRequest.findOne({
      citizen_id: citizen._id,
      purpose: demoCase.purpose,
    });
    const created = !request;

    if (!request) {
      request = await createRequest({
        citizenUser: citizen,
        documentTypeId: documentTypesByCode.get(demoCase.documentCode)._id.toString(),
        purpose: demoCase.purpose,
        copies: demoCase.key === 'released-business' ? 2 : 1,
        actorUser: citizen,
      });
    }

    request = await advanceDemoCase(request, demoCase, staff);
    const issuedDocument = await IssuedDocument.findOne({ request_id: request._id }).select('verification_code').lean();
    result.push({
      created,
      tracking_number: request.tracking_number,
      status: request.status,
      verification_code: issuedDocument ? issuedDocument.verification_code : null,
    });
  }

  const counts = await DocumentRequest.aggregate([
    { $match: { citizen_id: citizen._id, purpose: { $regex: '^DEMO DATA - QuickFile sample set v1:' } } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  console.log(
    JSON.stringify(
      {
        database: mongoose.connection.name,
        demo_requests: result,
        demo_status_counts: Object.fromEntries(counts.map((item) => [item._id, item.count])),
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  seedDemoData()
    .catch((error) => {
      console.error('[DemoSeeder] Failed:', error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    });
}

module.exports = { seedDemoData };
