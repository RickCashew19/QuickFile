const { getDatabase } = require('../../config/db');

class RequestModel {
  static get db() {
    return getDatabase();
  }

  static create({ trackingNumber, userId, documentTypeId, purpose, formData, attachmentPath, attachmentName, fee, paymentStatus }) {
    const stmt = this.db.prepare(`
      INSERT INTO document_requests (
        tracking_number, user_id, document_type_id, purpose, form_data,
        attachment_path, attachment_name, fee, payment_status, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `);
    const res = stmt.run(
      trackingNumber,
      userId,
      documentTypeId,
      purpose,
      formData,
      attachmentPath || null,
      attachmentName || null,
      Number(fee) || 0,
      paymentStatus || (fee > 0 ? 'UNPAID' : 'WAIVED')
    );
    return this.findById(res.lastInsertRowid);
  }

  static findById(id) {
    return this.db.prepare(`
      SELECT 
        r.*, 
        dt.name as document_name, 
        dt.code as document_code, 
        dt.description as document_description,
        dt.requirements_text as document_requirements,
        u.full_name as citizen_name,
        u.email as citizen_email,
        u.phone as citizen_phone,
        staff_rev.full_name as reviewed_by_name,
        staff_prep.full_name as prepared_by_name,
        staff_rel.full_name as released_by_name,
        doc.certificate_number,
        doc.verification_code,
        doc.validity_status,
        doc.qr_code_image,
        doc.qr_data,
        doc.issued_at
      FROM document_requests r
      JOIN document_types dt ON dt.id = r.document_type_id
      JOIN users u ON u.id = r.user_id
      LEFT JOIN users staff_rev ON staff_rev.id = r.reviewed_by
      LEFT JOIN users staff_prep ON staff_prep.id = r.prepared_by
      LEFT JOIN users staff_rel ON staff_rel.id = r.released_by
      LEFT JOIN issued_documents doc ON doc.request_id = r.id
      WHERE r.id = ?
    `).get(id);
  }

  static findByTrackingNumber(trackingNumber) {
    return this.db.prepare(`
      SELECT 
        r.*, 
        dt.name as document_name, 
        dt.code as document_code, 
        dt.description as document_description,
        dt.requirements_text as document_requirements,
        u.full_name as citizen_name,
        u.email as citizen_email,
        u.phone as citizen_phone,
        staff_rev.full_name as reviewed_by_name,
        staff_prep.full_name as prepared_by_name,
        staff_rel.full_name as released_by_name,
        doc.certificate_number,
        doc.verification_code,
        doc.validity_status,
        doc.qr_code_image,
        doc.qr_data,
        doc.issued_at
      FROM document_requests r
      JOIN document_types dt ON dt.id = r.document_type_id
      JOIN users u ON u.id = r.user_id
      LEFT JOIN users staff_rev ON staff_rev.id = r.reviewed_by
      LEFT JOIN users staff_prep ON staff_prep.id = r.prepared_by
      LEFT JOIN users staff_rel ON staff_rel.id = r.released_by
      LEFT JOIN issued_documents doc ON doc.request_id = r.id
      WHERE r.tracking_number = ? COLLATE NOCASE
    `).get(trackingNumber);
  }

  static findByUserId(userId) {
    return this.db.prepare(`
      SELECT 
        r.*, 
        dt.name as document_name, 
        dt.code as document_code,
        doc.certificate_number,
        doc.verification_code,
        doc.validity_status
      FROM document_requests r
      JOIN document_types dt ON dt.id = r.document_type_id
      LEFT JOIN issued_documents doc ON doc.request_id = r.id
      WHERE r.user_id = ?
      ORDER BY r.created_at DESC
    `).all(userId);
  }

  static findAll({ status, documentTypeId, search, limit = 100, offset = 0, isArchived = null } = {}) {
    let sql = `
      SELECT 
        r.*, 
        dt.name as document_name, 
        dt.code as document_code, 
        u.full_name as citizen_name,
        u.email as citizen_email,
        u.phone as citizen_phone,
        doc.certificate_number,
        doc.verification_code,
        doc.validity_status
      FROM document_requests r
      JOIN document_types dt ON dt.id = r.document_type_id
      JOIN users u ON u.id = r.user_id
      LEFT JOIN issued_documents doc ON doc.request_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (isArchived === true) {
      sql += ` AND r.status = 'ARCHIVED'`;
    } else if (isArchived === false) {
      sql += ` AND r.status != 'ARCHIVED'`;
    }

    if (status && status !== 'ALL') {
      sql += ` AND r.status = ?`;
      params.push(status);
    }

    if (documentTypeId) {
      sql += ` AND r.document_type_id = ?`;
      params.push(documentTypeId);
    }

    if (search && search.trim() !== '') {
      const q = `%${search.trim()}%`;
      sql += ` AND (r.tracking_number LIKE ? OR u.full_name LIKE ? OR dt.name LIKE ? OR doc.certificate_number LIKE ?)`;
      params.push(q, q, q, q);
    }

    sql += ` ORDER BY r.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    return this.db.prepare(sql).all(...params);
  }

  static updateStatus(id, { status, rejectionReason, reviewedBy, preparedBy, releasedBy, releasedAt, archivedAt, paymentStatus }) {
    const fields = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [status];

    if (rejectionReason !== undefined) {
      fields.push('rejection_reason = ?');
      params.push(rejectionReason);
    }
    if (reviewedBy !== undefined) {
      fields.push('reviewed_by = ?');
      params.push(reviewedBy);
    }
    if (preparedBy !== undefined) {
      fields.push('prepared_by = ?');
      params.push(preparedBy);
    }
    if (releasedBy !== undefined) {
      fields.push('released_by = ?');
      params.push(releasedBy);
    }
    if (releasedAt !== undefined) {
      fields.push('released_at = ?');
      params.push(releasedAt);
    }
    if (archivedAt !== undefined) {
      fields.push('archived_at = ?');
      params.push(archivedAt);
    }
    if (paymentStatus !== undefined) {
      fields.push('payment_status = ?');
      params.push(paymentStatus);
    }

    params.push(id);
    const sql = `UPDATE document_requests SET ${fields.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...params);

    return this.findById(id);
  }

  static saveIssuedDocument({ requestId, certificateNumber, verificationCode, qrData, qrCodeImage, issuedToName, documentName, validityStatus = 'VALID', expiresAt = null }) {
    const stmt = this.db.prepare(`
      INSERT INTO issued_documents (
        request_id, certificate_number, verification_code, qr_data, qr_code_image,
        issued_to_name, document_name, validity_status, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const res = stmt.run(
      requestId,
      certificateNumber,
      verificationCode,
      qrData,
      qrCodeImage || null,
      issuedToName,
      documentName,
      validityStatus,
      expiresAt
    );
    return res.lastInsertRowid;
  }

  static getIssuedDocumentByCode(code) {
    return this.db.prepare(`
      SELECT 
        d.*,
        r.tracking_number,
        r.purpose,
        r.form_data,
        r.released_at,
        u.email as citizen_email,
        u.phone as citizen_phone,
        dt.code as document_code
      FROM issued_documents d
      JOIN document_requests r ON r.id = d.request_id
      JOIN users u ON u.id = r.user_id
      JOIN document_types dt ON dt.id = r.document_type_id
      WHERE d.verification_code = ? COLLATE NOCASE 
         OR d.certificate_number = ? COLLATE NOCASE
         OR r.tracking_number = ? COLLATE NOCASE
    `).get(code, code, code);
  }

  static getAllIssuedDocuments({ limit = 100, search = '' } = {}) {
    let sql = `
      SELECT 
        d.*,
        r.tracking_number,
        r.purpose,
        u.email as citizen_email
      FROM issued_documents d
      JOIN document_requests r ON r.id = d.request_id
      JOIN users u ON u.id = r.user_id
    `;
    const params = [];
    if (search && search.trim() !== '') {
      const q = `%${search.trim()}%`;
      sql += ` WHERE d.certificate_number LIKE ? OR d.issued_to_name LIKE ? OR d.document_name LIKE ? OR d.verification_code LIKE ?`;
      params.push(q, q, q, q);
    }
    sql += ` ORDER BY d.issued_at DESC LIMIT ?`;
    params.push(limit);

    return this.db.prepare(sql).all(...params);
  }

  static updateIssuedDocumentValidity(id, validityStatus, revokedReason = null) {
    const stmt = this.db.prepare(`
      UPDATE issued_documents
      SET validity_status = ?, revoked_at = ?, revoked_reason = ?
      WHERE id = ?
    `);
    const revokedAt = validityStatus === 'REVOKED' ? new Date().toISOString() : null;
    stmt.run(validityStatus, revokedAt, revokedReason, id);
  }

  static getOverviewStats() {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_requests,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_requests,
        SUM(CASE WHEN status = 'UNDER_REVIEW' THEN 1 ELSE 0 END) as under_review_requests,
        SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END) as approved_requests,
        SUM(CASE WHEN status = 'IN_PREPARATION' THEN 1 ELSE 0 END) as in_prep_requests,
        SUM(CASE WHEN status = 'READY_FOR_PICKUP' THEN 1 ELSE 0 END) as ready_requests,
        SUM(CASE WHEN status = 'RELEASED' THEN 1 ELSE 0 END) as released_requests,
        SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected_requests,
        SUM(CASE WHEN status = 'ARCHIVED' THEN 1 ELSE 0 END) as archived_requests,
        SUM(CASE WHEN payment_status = 'PAID' THEN fee ELSE 0 END) as total_revenue
      FROM document_requests
    `).get();

    const counts = this.db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'citizen') as total_citizens,
        (SELECT COUNT(*) FROM users WHERE role = 'staff' AND is_active = 1) as active_staff,
        (SELECT COUNT(*) FROM document_types WHERE is_active = 1) as active_document_types,
        (SELECT COUNT(*) FROM issued_documents WHERE validity_status = 'VALID') as valid_issued_documents
    `).get();

    return { ...stats, ...counts };
  }

  static getStaffWorkload() {
    return this.db.prepare(`
      SELECT 
        u.id as staff_id,
        u.full_name,
        u.email,
        sd.position,
        sd.department,
        COUNT(r.id) as processed_count,
        SUM(CASE WHEN r.status = 'RELEASED' THEN 1 ELSE 0 END) as released_count
      FROM users u
      LEFT JOIN staff_details sd ON sd.user_id = u.id
      LEFT JOIN document_requests r ON (r.reviewed_by = u.id OR r.prepared_by = u.id OR r.released_by = u.id)
      WHERE u.role = 'staff' AND u.is_active = 1
      GROUP BY u.id
      ORDER BY processed_count DESC
    `).all();
  }

  static getDocumentTypeBreakdown() {
    return this.db.prepare(`
      SELECT 
        dt.name,
        dt.code,
        COUNT(r.id) as request_count,
        SUM(CASE WHEN r.status = 'RELEASED' THEN 1 ELSE 0 END) as released_count,
        SUM(CASE WHEN r.payment_status = 'PAID' THEN r.fee ELSE 0 END) as revenue
      FROM document_types dt
      LEFT JOIN document_requests r ON r.document_type_id = dt.id
      GROUP BY dt.id
      ORDER BY request_count DESC
    `).all();
  }
}

module.exports = RequestModel;
