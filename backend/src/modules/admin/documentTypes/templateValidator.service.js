const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { ALLOWED_PLACEHOLDER_KEYS } = require('../../../utils/templatePlaceholders');

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_UNCOMPRESSED_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_ZIP_ENTRIES = 300;

// PNG binary magic bytes header
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Standard Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(s1, s2) {
  const a = s1.toLowerCase();
  const b = s2.toLowerCase();
  const costs = [];
  for (let i = 0; i <= a.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= b.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (a.charAt(i - 1) !== b.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[b.length] = lastValue;
  }
  return costs[b.length];
}

/**
 * Finds the closest allowlisted catalog placeholder for a typo
 */
function findClosestPlaceholder(unknownTag) {
  let closest = null;
  let minDistance = Infinity;
  for (const key of ALLOWED_PLACEHOLDER_KEYS) {
    const d = levenshteinDistance(unknownTag, key);
    if (d < minDistance) {
      minDistance = d;
      closest = key;
    }
  }
  return minDistance <= 4 ? closest : null;
}

/**
 * Validates a Word DOCX template buffer against OpenXML security and catalog rules.
 * Pure function: reused by upload handler, preview renderer, and test suites.
 *
 * @param {Buffer} buffer
 * @returns {{ valid: boolean, errors: string[], warnings: string[], placeholders_found: string[], unknown: string[], qr_media_path: string | null }}
 */
function validateDocxTemplate(buffer) {
  const errors = [];
  const warnings = [];
  const placeholdersFoundSet = new Set();
  const unknownTagsSet = new Set();
  let qrMediaPath = null;

  // 1. File size check
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return {
      valid: false,
      errors: ['Invalid input: file buffer is required.'],
      warnings: [],
      placeholders_found: [],
      unknown: [],
      qr_media_path: null,
    };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    errors.push(`File size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of 2 MB.`);
    return {
      valid: false,
      errors,
      warnings,
      placeholders_found: [],
      unknown: [],
      qr_media_path: null,
    };
  }

  // 2. Real ZIP magic bytes validation (PK\x03\x04, PK\x05\x06, or PK\x07\x08)
  const isZip =
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07);

  if (!isZip) {
    errors.push('Invalid file format. File does not contain valid ZIP/DOCX header magic bytes.');
    return {
      valid: false,
      errors,
      warnings,
      placeholders_found: [],
      unknown: [],
      qr_media_path: null,
    };
  }

  // 3. Parse ZIP archive with PizZip
  let zip;
  try {
    zip = new PizZip(buffer);
  } catch (err) {
    errors.push(`Corrupted or malformed DOCX archive: ${err.message}`);
    return {
      valid: false,
      errors,
      warnings,
      placeholders_found: [],
      unknown: [],
      qr_media_path: null,
    };
  }

  const fileNames = Object.keys(zip.files);

  // 4. Entry count and zip bomb protection
  if (fileNames.length > MAX_ZIP_ENTRIES) {
    errors.push(`DOCX archive contains ${fileNames.length} entries, exceeding maximum limit of ${MAX_ZIP_ENTRIES}.`);
    return {
      valid: false,
      errors,
      warnings,
      placeholders_found: [],
      unknown: [],
      qr_media_path: null,
    };
  }

  let totalUncompressed = 0;
  for (const name of fileNames) {
    const file = zip.file(name);
    if (file) {
      const size = file.asNodeBuffer().length;
      totalUncompressed += size;
      if (totalUncompressed > MAX_UNCOMPRESSED_SIZE) {
        errors.push(`Uncompressed content exceeds maximum allowed limit of 20 MB (potential zip bomb).`);
        return {
          valid: false,
          errors,
          warnings,
          placeholders_found: [],
          unknown: [],
          qr_media_path: null,
        };
      }
    }
  }

  // 5. Required core parts in DOCX package
  if (!zip.file('[Content_Types].xml') || !zip.file('word/document.xml')) {
    errors.push('Invalid DOCX package: missing required [Content_Types].xml or word/document.xml.');
    return {
      valid: false,
      errors,
      warnings,
      placeholders_found: [],
      unknown: [],
      qr_media_path: null,
    };
  }

  // 6. Security rejections: prohibited parts and embeddings
  for (const name of fileNames) {
    const lower = name.toLowerCase();
    if (lower.includes('vbaproject.bin')) {
      errors.push('Prohibited content: VBA macro binary project (vbaProject.bin) detected.');
    }
    if (lower.includes('word/embeddings/')) {
      errors.push('Prohibited content: Embedded OLE object or package (word/embeddings/) detected.');
    }
    if (lower.includes('activex/')) {
      errors.push('Prohibited content: ActiveX controls (activeX/) detected.');
    }
  }

  // 7. Security rejections: macro-enabled content types
  const contentTypesXml = zip.file('[Content_Types].xml').asText();
  if (
    contentTypesXml.includes('macroEnabled') ||
    contentTypesXml.includes('vnd.ms-word.template.macroEnabledTemplate')
  ) {
    errors.push('Prohibited content: Macro-enabled content type declared in [Content_Types].xml.');
  }

  // 8. Security rejections: external relationships and prohibited targets
  for (const name of fileNames) {
    if (name.endsWith('.rels')) {
      const relsXml = zip.file(name).asText();

      // Check external relationships
      const relTagRegex = /<Relationship\b([^>]+)\/?>/gi;
      let relMatch;
      while ((relMatch = relTagRegex.exec(relsXml)) !== null) {
        const attrs = relMatch[1];
        const isExternal = /TargetMode=["']External["']/i.test(attrs);
        if (isExternal) {
          const isHyperlink = /Type=["'][^"']*relationships\/hyperlink["']/i.test(attrs);
          if (!isHyperlink) {
            errors.push(`Prohibited external relationship target detected in "${name}". Only standard hyperlinks are allowed.`);
          }
        }
      }

      // Check prohibited relationship types
      if (relsXml.includes('attachedTemplate')) {
        errors.push(`Prohibited relationship: attachedTemplate detected in "${name}".`);
      }
      if (relsXml.includes('oleObject')) {
        errors.push(`Prohibited relationship: oleObject detected in "${name}".`);
      }
      if (relsXml.includes('externalLink')) {
        errors.push(`Prohibited relationship: externalLink detected in "${name}".`);
      }
    }
  }

  // 9. Security rejections: dynamic fields in XML (INCLUDETEXT, INCLUDEPICTURE, DDE, etc.)
  const xmlPartsToCheck = fileNames.filter(
    (n) => n.startsWith('word/') && n.endsWith('.xml') && !n.includes('_rels')
  );

  const forbiddenFieldRegex = /\b(INCLUDETEXT|INCLUDEPICTURE|DDE|DDEAUTO|LINK|IMPORT)\b/i;
  for (const partName of xmlPartsToCheck) {
    const xmlContent = zip.file(partName).asText();

    // Check <w:instrText>
    const instrRegex = /<w:instrText\b[^>]*>([\s\S]*?)<\/w:instrText>/gi;
    let instrMatch;
    while ((instrMatch = instrRegex.exec(xmlContent)) !== null) {
      if (forbiddenFieldRegex.test(instrMatch[1])) {
        errors.push(`Prohibited dynamic field instruction detected in "${partName}": ${instrMatch[1].trim()}`);
      }
    }

    // Check <w:fldSimple w:instr="...">
    const fldSimpleRegex = /<w:fldSimple\b[^>]*w:instr=["']([^"']+)["']/gi;
    let fldMatch;
    while ((fldMatch = fldSimpleRegex.exec(xmlContent)) !== null) {
      if (forbiddenFieldRegex.test(fldMatch[1])) {
        errors.push(`Prohibited dynamic field instruction detected in "${partName}": ${fldMatch[1].trim()}`);
      }
    }
  }

  // 10. Extract placeholders & validate syntax using docxtemplater
  let doc;
  try {
    doc = new Docxtemplater(zip, {
      paragraphLoop: false,
      linebreaks: true,
      errorLogging: false,
    });
  } catch (err) {
    if (err.properties && Array.isArray(err.properties.errors)) {
      for (const e of err.properties.errors) {
        errors.push(`Template syntax error in "${e.properties?.file || 'document'}": ${e.properties?.explanation || e.message}`);
      }
    } else {
      errors.push(`Template compilation error: ${err.message}`);
    }
    return {
      valid: false,
      errors,
      warnings,
      placeholders_found: [],
      unknown: [],
      qr_media_path: null,
    };
  }

  // Gather compiled XmlTemplater parts (document.xml and headers/footers)
  const compiledFiles = Object.keys(doc.compiled);
  for (const cFile of compiledFiles) {
    const xt = doc.compiled[cFile];
    if (!xt || !Array.isArray(xt.parsed)) continue;

    for (const token of xt.parsed) {
      if (token.type === 'placeholder') {
        const rawTag = token.raw || token.value || '';
        const trimmedTag = rawTag.trim();

        // Reject loops, conditions, expressions, and filters
        if (
          trimmedTag.startsWith('#') ||
          trimmedTag.startsWith('^') ||
          trimmedTag.startsWith('/') ||
          /[|()+*=-]/.test(trimmedTag)
        ) {
          errors.push(
            `Unsupported tag syntax "{${trimmedTag}}" in "${cFile}". Only plain {name} tags are supported (loops, conditions, expressions, and filters are not allowed).`
          );
          continue;
        }

        const tagKey = trimmedTag;
        placeholdersFoundSet.add(tagKey);

        // Validate tag against allowlisted catalog
        if (!ALLOWED_PLACEHOLDER_KEYS.includes(tagKey)) {
          unknownTagsSet.add(tagKey);
          const suggestion = findClosestPlaceholder(tagKey);
          if (suggestion) {
            errors.push(`Unknown placeholder "{${tagKey}}" in "${cFile}". Did you mean "{${suggestion}}"?`);
          } else {
            errors.push(`Unknown placeholder "{${tagKey}}" in "${cFile}". Only allowlisted catalog placeholders are supported.`);
          }
        }
      }
    }
  }

  const placeholdersFound = Array.from(placeholdersFoundSet);
  const unknownTags = Array.from(unknownTagsSet);

  // 11. Scan for QR code image with docPr alt text (descr or title) == "qr_code"
  for (const partName of xmlPartsToCheck) {
    const xml = zip.file(partName).asText();
    const relsPartName = partName.replace('word/', 'word/_rels/') + '.rels';
    const relsFile = zip.file(relsPartName);
    const relsXml = relsFile ? relsFile.asText() : '';

    const drawingRegex = /<w:drawing[\s\S]*?<\/w:drawing>/gi;
    let dMatch;
    while ((dMatch = drawingRegex.exec(xml)) !== null) {
      const drawingXml = dMatch[0];
      const hasQrDocPr = /<wp:docPr\b[^>]*(?:descr=["']qr_code["']|title=["']qr_code["'])/i.test(drawingXml);

      if (hasQrDocPr) {
        const blipMatch = /<a:blip\b[^>]*\br:embed=["']([^"']+)["']/i.exec(drawingXml);
        if (blipMatch) {
          const rId = blipMatch[1];
          const relMatch = new RegExp(`<Relationship\\b[^>]*Id=["']${rId}["'][^>]*Target=["']([^"']+)["']`, 'i').exec(relsXml);
          if (relMatch) {
            let target = relMatch[1];
            // Normalize path relative to word/
            if (!target.startsWith('word/')) {
              target = target.startsWith('/') ? target.slice(1) : `word/${target}`;
            }

            const mediaFile = zip.file(target);
            if (!mediaFile) {
              errors.push(`QR code image referenced by relationship ID "${rId}" (${target}) is missing from the archive.`);
            } else {
              const mediaBuf = mediaFile.asNodeBuffer();
              const isPng = mediaBuf.length >= 8 && mediaBuf.subarray(0, 8).equals(PNG_SIGNATURE);
              if (!isPng) {
                errors.push(`QR code image placeholder ("${target}") must be a valid PNG image format.`);
              } else {
                qrMediaPath = target;
              }
            }
          }
        }
      }
    }
  }

  // 12. Enforce required certificate identifiers
  if (!placeholdersFoundSet.has('certificate_number')) {
    errors.push('Missing required placeholder: {certificate_number} must be present in the template.');
  }

  const hasVerificationCode = placeholdersFoundSet.has('verification_code');
  const hasVerificationUrl = placeholdersFoundSet.has('verification_url');
  const hasQrImage = qrMediaPath !== null;

  if (!hasVerificationCode && !hasVerificationUrl && !hasQrImage) {
    errors.push(
      'Missing required verification element: Template must contain at least one of {verification_code}, {verification_url}, or a QR code image with alt text "qr_code".'
    );
  }

  // 13. Warning if full_name is missing
  if (!placeholdersFoundSet.has('full_name') && !placeholdersFoundSet.has('full_name_upper')) {
    warnings.push("Template does not contain {full_name}. Certificates typically include the recipient citizen's full legal name.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    placeholders_found: placeholdersFound,
    unknown: unknownTags,
    qr_media_path: qrMediaPath,
  };
}

module.exports = {
  validateDocxTemplate,
  MAX_FILE_SIZE,
  MAX_UNCOMPRESSED_SIZE,
  MAX_ZIP_ENTRIES,
  PNG_SIGNATURE,
};
