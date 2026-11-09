const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun } = require('docx');
const { PLACEHOLDER_CATALOG } = require('../../../utils/templatePlaceholders');

// 100x100 PNG placeholder image (transparent square with a border)
const STARTER_QR_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAABmJLR0QA/wD/AP+gvaeTAAAAZUlEQVR42u3PMQ0AMAgAMXw8xYUGD3qI7N0k0L2sCgAAAAAA4HfrAABzDBAAAAAwxgAAAMAYAwAAAGMMAAAAjDEAAAAwxgAAAMAYAwAAAGMMAAAAjDEAAAAwxgAAAMAYAwAAAGPMRa/1B78uB8/IAAAAAElFTkSuQmCC';

/**
 * Builds a valid starter DOCX document containing all allowlisted placeholders,
 * an official sample certificate paragraph, and a PNG image with alt text 'qr_code'.
 *
 * @returns {Promise<Buffer>}
 */
async function buildStarterDocxBuffer() {
  const qrBuffer = Buffer.from(STARTER_QR_PNG_BASE64, 'base64');

  const children = [
    new Paragraph({
      text: 'Republic of the Philippines',
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: 'Province of {province}',
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: '{city_municipality}',
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      text: 'BARANGAY {barangay_name_upper}',
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph({
      text: '{office_name}',
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      text: '{document_name_upper}',
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Certificate No.: ', bold: true }),
        new TextRun('{certificate_number}'),
      ],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: 'TO WHOM IT MAY CONCERN:', bold: true }),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: 'THIS IS TO CERTIFY that ' }),
        new TextRun({ text: '{full_name_upper}', bold: true }),
        new TextRun({ text: ' ({first_name} {middle_name} {last_name} {suffix}), ' }),
        new TextRun({ text: '{age} years of age, {gender}, {civil_status}, ' }),
        new TextRun({ text: 'born on {birthdate_long}, with occupation as {occupation}, ' }),
        new TextRun({ text: 'is a bonafide resident of {address}, Barangay {barangay}, {city}, {province}.' }),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: 'This certification is issued upon the request of the interested party for the purpose of: ' }),
        new TextRun({ text: '{purpose}', bold: true }),
        new TextRun({ text: ' (Tracking #: {tracking_number}, Copies: {copies}, Code: {document_code}).' }),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Issued on this {issued_date_long} ({issued_date}, {issued_day_ordinal} of {issued_month}, {issued_year}) ' }),
        new TextRun({ text: 'at Barangay {barangay_name}. ' }),
        new TextRun({ text: 'Valid until: {expiry_date}.' }),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Official Verification Details:', bold: true }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun('Verification Code: {verification_code}\n'),
        new TextRun('Registry URL: {verification_url}'),
      ],
    }),
    new Paragraph({ text: '' }),
    // Official QR image with alt text 'qr_code'
    new Paragraph({
      children: [
        new ImageRun({
          data: qrBuffer,
          transformation: { width: 120, height: 120 },
          altText: {
            title: 'qr_code',
            description: 'qr_code',
            name: 'qr_code',
          },
        }),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Certified by:\n', bold: true }),
        new TextRun('{secretary_name}\nBarangay Secretary\n\n'),
        new TextRun({ text: 'Approved & Attested:\n', bold: true }),
        new TextRun('{captain_name}\nPunong Barangay'),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: '--- ALLOWLISTED PLACEHOLDER REFERENCE CATALOG ---', bold: true }),
      ],
    }),
  ];

  // Append full placeholder table for reference
  for (const entry of PLACEHOLDER_CATALOG) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `{${entry.key}}`, bold: true }),
          new TextRun(` (${entry.group}) - ${entry.label}: Example: "${entry.example}"`),
        ],
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

module.exports = {
  buildStarterDocxBuffer,
};
