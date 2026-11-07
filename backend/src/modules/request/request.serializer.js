/**
 * Request Serializer for Citizen-facing responses
 * Strictly enforces an allowlist of fields.
 * Excludes internal processing_notes, handler user IDs (*_by), staff creator IDs,
 * internal server file paths, and Mongoose __v internals.
 */

function serializeCitizenRequest(doc) {
  if (!doc) return null;

  const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;

  // Format document type reference safely
  let docType = null;
  if (raw.document_type_id && typeof raw.document_type_id === 'object' && raw.document_type_id.name) {
    docType = {
      id: raw.document_type_id._id ? raw.document_type_id._id.toString() : raw.document_type_id.id,
      name: raw.document_type_id.name,
      code: raw.document_type_id.code,
      processing_days: raw.document_type_id.processing_days,
    };
  } else if (raw.document_type_id) {
    docType = {
      id: raw.document_type_id.toString(),
    };
  }

  // Format attachments safe allowlist (no server disk path)
  const safeAttachments = (raw.attachments || []).map((att) => ({
    original_name: att.original_name,
    stored_filename: att.stored_filename,
    mime_type: att.mime_type,
    file_size: att.file_size,
    uploaded_at: att.uploaded_at,
  }));

  return {
    tracking_number: raw.tracking_number,
    document_type: docType,
    purpose: raw.purpose,
    copies: raw.copies,
    status: raw.status,
    unit_fee: raw.unit_fee ?? 0,
    fee: raw.fee ?? 0,
    payment_status: raw.payment_status,
    paid_at: raw.paid_at || null,
    form_data: raw.form_data || {},
    rejection_reason: raw.rejection_reason || '',
    cancellation_reason: raw.cancellation_reason || '',
    attachments: safeAttachments,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    reviewed_at: raw.reviewed_at || null,
    approved_at: raw.approved_at || null,
    prepared_at: raw.prepared_at || null,
    ready_at: raw.ready_at || null,
    released_at: raw.released_at || null,
    rejected_at: raw.rejected_at || null,
    archived_at: raw.archived_at || null,
    cancelled_at: raw.cancelled_at || null,
  };
}

module.exports = {
  serializeCitizenRequest,
};
