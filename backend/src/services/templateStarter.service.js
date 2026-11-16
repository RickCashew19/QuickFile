const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ImageRun } = require('docx');
const QRCode = require('qrcode');

/**
 * Builds a valid starter DOCX document containing all allowlisted placeholders,
 * an official sample certificate layout, and a real PNG QR code image with alt text 'qr_code'.
 *
 * @returns {Promise<Buffer>}
 */
async function buildStarterDocxBuffer() {
  // Generate real PNG placeholder QR image using qrcode package
  const qrBuffer = await QRCode.toBuffer('https://quickfile.gov.ph/verify/STARTER-PREVIEW-QR', {
    type: 'png',
    width: 150,
    margin: 1,
    errorCorrectionLevel: 'M',
  });

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
      text: '{office_name} ({barangay_name})',
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
        new TextRun({ text: 'Certificate of ', bold: true }),
        new TextRun('{document_name}'),
        new TextRun(' | Certificate No.: '),
        new TextRun({ text: '{certificate_number}', bold: true }),
        new TextRun(' | Document Code: '),
        new TextRun('{document_code}'),
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
        new TextRun(' ({full_name}), recorded as {first_name} {middle_name} {last_name} {suffix}, '),
        new TextRun('{age} years of age, {gender}, {civil_status}, '),
        new TextRun('born on {birthdate_long}, with occupation as {occupation}, '),
        new TextRun('is a bonafide resident of {address}, Purok/Zone: {purok_zone}, Barangay {barangay}, {city}, {province}.'),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: 'This certification is issued upon the request of the interested party for the purpose of: ' }),
        new TextRun({ text: '{purpose}', bold: true }),
        new TextRun(' (Tracking #: {tracking_number}, Copies: {copies}).'),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun('Issued on this {issued_date_long} (Date: {issued_date}, this {issued_day_ordinal} day of {issued_month}, {issued_year}) '),
        new TextRun('at Barangay {barangay_name}. '),
        new TextRun('Valid until: {expiry_date}.'),
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
        new TextRun({ text: 'Verification Code: ', bold: true }),
        new TextRun('{verification_code}'),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Registry URL: ', bold: true }),
        new TextRun('{verification_url}'),
      ],
    }),
    new Paragraph({ text: '' }),
    // Official QR image with docPr alt text 'qr_code'
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
    // Separate paragraphs for signature lines
    new Paragraph({
      children: [
        new TextRun({ text: 'Certified by:', bold: true }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun('{secretary_name}'),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun('Barangay Secretary'),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Approved & Attested:', bold: true }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun('{captain_name}'),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun('Punong Barangay'),
      ],
    }),
  ];

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
