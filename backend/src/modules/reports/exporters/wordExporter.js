const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  Header,
  Footer,
  PageNumber,
} = require('docx');
const { config } = require('../../../config');
const { formatLocalTimestamp, formatLocalDate } = require('../../../utils/dateUtil');

function createCell(text, isHeader = false, widthPercent = null, align = AlignmentType.LEFT) {
  return new TableCell({
    width: widthPercent ? { size: widthPercent, type: WidthType.PERCENTAGE } : undefined,
    shading: isHeader ? { fill: '1E3A8A' } : undefined,
    children: [
      new Paragraph({
        alignment: align,
        children: [
          new TextRun({
            text: String(text !== undefined && text !== null ? text : ''),
            bold: isHeader,
            color: isHeader ? 'FFFFFF' : '1F2937',
            size: 16, // 8pt
            font: 'Arial',
          }),
        ],
      }),
    ],
  });
}

/**
 * Generates an official Word (.docx) report buffer using docx
 * Features real XML Header & Footer parts, page number fields, and signature blocks.
 */
async function generateWordReport(reportData, options = {}) {
  const { scope = 'staff', actorUser = {} } = options;
  const { summary, by_document_type = [], by_status = [], staff_workload = [], transactions = {}, signatories = {} } = reportData;

  const barangayName = config.jurisdiction.barangayName() || 'Barangay Local Government Unit';
  const cityMunicipality = config.jurisdiction.cityMunicipality() || '';
  const province = config.jurisdiction.province() || '';
  const jurisdictionText = [cityMunicipality, province].filter(Boolean).join(', ');

  const fromFormatted = summary.from || '';
  const toFormatted = summary.to || '';
  const generatedAt = formatLocalTimestamp(new Date());
  const reportTitle = scope === 'admin'
    ? 'Official Barangay Document & Revenue Management Audit Report'
    : 'Barangay Document Transactions & Issuance Summary Report';

  const docChildren = [
    // Document Title Block
    new Paragraph({
      alignment: AlignmentType.CENTER,
      heading: HeadingLevel.HEADING_1,
      children: [
        new TextRun({
          text: barangayName.toUpperCase(),
          bold: true,
          color: '1E3A8A',
          size: 26,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: reportTitle,
          bold: true,
          color: '4B5563',
          size: 20,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Period: ${fromFormatted} to ${toFormatted}  |  Scope: ${scope === 'admin' ? 'Administrator (Full System)' : 'Staff (Operations)'}`,
          color: '6B7280',
          size: 16,
        }),
      ],
      spacing: { after: 200 },
    }),

    // Section 1: Executive Summary
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: '1. Executive Summary', bold: true, color: '1E3A8A', size: 20 })],
      spacing: { before: 150, after: 80 },
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createCell('Metric Indicator', true, 60),
            createCell('Summary Value', true, 40, AlignmentType.RIGHT),
          ],
        }),
        new TableRow({ children: [createCell('Total Requests Submitted'), createCell(summary.total_requests || 0, false, null, AlignmentType.RIGHT)] }),
        new TableRow({ children: [createCell('Total Requests Released'), createCell(summary.released_count || 0, false, null, AlignmentType.RIGHT)] }),
        new TableRow({ children: [createCell('Total Requests Rejected'), createCell(summary.rejected_count || 0, false, null, AlignmentType.RIGHT)] }),
        new TableRow({ children: [createCell('Total Collected Revenue'), createCell(`₱ ${(summary.total_revenue || 0).toFixed(2)}`, false, null, AlignmentType.RIGHT)] }),
        new TableRow({ children: [createCell('Fees Waived (Indigency / Exempt)'), createCell(`${summary.waived_count || 0} (₱ ${(summary.waived_amount || 0).toFixed(2)})`, false, null, AlignmentType.RIGHT)] }),
      ],
    }),

    // Section 2: Breakdown by Document Type
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: '2. Requests by Document Type', bold: true, color: '1E3A8A', size: 20 })],
      spacing: { before: 200, after: 80 },
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createCell('Code', true, 15),
            createCell('Document Name', true, 40),
            createCell('Requests', true, 15, AlignmentType.RIGHT),
            createCell('Unit Fee', true, 15, AlignmentType.RIGHT),
            createCell('Revenue', true, 15, AlignmentType.RIGHT),
          ],
        }),
        ...by_document_type.map(
          (d) =>
            new TableRow({
              children: [
                createCell(d.document_code || 'N/A'),
                createCell(d.document_name || 'Unnamed Document'),
                createCell(d.count || 0, false, null, AlignmentType.RIGHT),
                createCell(`₱ ${(d.unit_fee || 0).toFixed(2)}`, false, null, AlignmentType.RIGHT),
                createCell(`₱ ${(d.collected_amount || 0).toFixed(2)}`, false, null, AlignmentType.RIGHT),
              ],
            })
        ),
      ],
    }),

    // Section 3: Status Breakdown
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: '3. Requests by Processing Status', bold: true, color: '1E3A8A', size: 20 })],
      spacing: { before: 200, after: 80 },
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            createCell('Processing Status', true, 60),
            createCell('Total Requests', true, 40, AlignmentType.RIGHT),
          ],
        }),
        ...by_status.map(
          (s) =>
            new TableRow({
              children: [
                createCell((s.status || '').toUpperCase().replace(/_/g, ' ')),
                createCell(s.count || 0, false, null, AlignmentType.RIGHT),
              ],
            })
        ),
      ],
    }),
  ];

  // Section 4: Staff Workload (Admin scope only)
  if (scope === 'admin' && Array.isArray(staff_workload) && staff_workload.length > 0) {
    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: '4. Staff Processing Workload', bold: true, color: '1E3A8A', size: 20 })],
        spacing: { before: 200, after: 80 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createCell('Staff Officer Name', true, 40),
              createCell('Role', true, 20),
              createCell('Actions Breakdown', true, 25),
              createCell('Total Actions', true, 15, AlignmentType.RIGHT),
            ],
          }),
          ...staff_workload.map((w) => {
            const breakdownText = Object.entries(w.per_status || {})
              .map(([st, cnt]) => `${st.replace(/_/g, ' ')}: ${cnt}`)
              .join(', ');
            return new TableRow({
              children: [
                createCell(w.staff_name || 'Staff Member'),
                createCell((w.role || 'staff').toUpperCase()),
                createCell(breakdownText || 'None'),
                createCell(w.total_actions || 0, false, null, AlignmentType.RIGHT),
              ],
            });
          }),
        ],
      })
    );
  }

  // Section 5: Detailed Transactions List
  const txItems = transactions.items || [];
  if (txItems.length > 0) {
    const sectionNum = scope === 'admin' && staff_workload.length > 0 ? '5' : '4';
    const isTruncated = transactions.truncated;
    const txHeadingText = isTruncated
      ? `${sectionNum}. Detailed Transactions (Showing first ${txItems.length} of ${transactions.total})`
      : `${sectionNum}. Detailed Transactions (${txItems.length} records)`;

    docChildren.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [
          new TextRun({
            text: txHeadingText,
            bold: true,
            color: '1E3A8A',
            size: 20,
          }),
        ],
        spacing: { before: 200, after: 60 },
      })
    );

    if (isTruncated) {
      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `* Showing first ${txItems.length} of ${transactions.total} records due to system export limits.`,
              italics: true,
              color: 'B91C1C',
              size: 16,
            }),
          ],
          spacing: { after: 80 },
        })
      );
    }

    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              createCell('Tracking #', true, 18),
              createCell('Applicant Name', true, 22),
              createCell('Document', true, 20),
              createCell('Status', true, 14),
              createCell('Fee', true, 12, AlignmentType.RIGHT),
              createCell('Requested', true, 14),
            ],
          }),
          ...txItems.map(
            (t) =>
              new TableRow({
                children: [
                  createCell(t.tracking_number || ''),
                  createCell(t.applicant_name || ''),
                  createCell(t.document_name || ''),
                  createCell((t.status || '').toUpperCase().replace(/_/g, ' ')),
                  createCell(`₱ ${(t.fee || 0).toFixed(2)}`, false, null, AlignmentType.RIGHT),
                  createCell(t.created_at ? formatLocalDate(t.created_at) : ''),
                ],
              })
          ),
        ],
      })
    );
  }

  // Signature Block
  const preparedByName = signatories.prepared_by || actorUser.full_name || 'Authorized Officer';
  const notedByName = (signatories.noted_by || '').trim();

  const sigRows = [
    new TableRow({
      children: [
        createCell('Prepared By:', true, 50),
        createCell(notedByName ? 'Noted By:' : '', Boolean(notedByName), 50),
      ],
    }),
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({ text: '' }),
            new Paragraph({
              children: [
                new TextRun({ text: preparedByName, bold: true, size: 18 }),
                new TextRun({ text: `\n${(actorUser.role || 'staff').toUpperCase()} - Records Officer`, color: '6B7280', size: 14 }),
              ],
            }),
          ],
        }),
        new TableCell({
          children: notedByName
            ? [
                new Paragraph({ text: '' }),
                new Paragraph({
                  children: [
                    new TextRun({ text: notedByName, bold: true, size: 18 }),
                    new TextRun({ text: '\nBarangay Authority', color: '6B7280', size: 14 }),
                  ],
                }),
              ]
            : [],
        }),
      ],
    }),
  ];

  docChildren.push(
    new Paragraph({ text: '', spacing: { before: 300, after: 100 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: sigRows,
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `${barangayName.toUpperCase()}  |  ${reportTitle}`, bold: true, size: 16, color: '1E3A8A' }),
                  new TextRun({ text: `  (Period: ${fromFormatted} to ${toFormatted})`, size: 14, color: '6B7280' }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `Generated by ${actorUser.full_name || 'Authorized Officer'} on ${generatedAt}  |  `, size: 14, color: '6B7280' }),
                  new TextRun({ text: 'Page ', size: 14, color: '6B7280' }),
                  PageNumber.CURRENT,
                  new TextRun({ text: ' of ', size: 14, color: '6B7280' }),
                  PageNumber.TOTAL_PAGES,
                ],
              }),
            ],
          }),
        },
        children: docChildren,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

module.exports = {
  generateWordReport,
};