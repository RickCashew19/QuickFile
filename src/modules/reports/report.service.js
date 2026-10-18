const RequestModel = require('../request/request.model');
const { getDatabase } = require('../../config/db');

class ReportService {
  static get db() {
    return getDatabase();
  }

  static getDashboardSummary() {
    const overview = RequestModel.getOverviewStats();
    const docBreakdown = RequestModel.getDocumentTypeBreakdown();
    const staffWorkload = RequestModel.getStaffWorkload();
    const recentRequests = RequestModel.findAll({ limit: 8 });

    return {
      overview,
      docBreakdown,
      staffWorkload,
      recentRequests
    };
  }

  static getTransactionReport({ startDate, endDate, status, documentTypeId } = {}) {
    let sql = `
      SELECT 
        r.id,
        r.tracking_number,
        r.created_at,
        r.released_at,
        r.purpose,
        r.status,
        r.fee,
        r.payment_status,
        dt.name as document_name,
        dt.code as document_code,
        u.full_name as citizen_name,
        u.email as citizen_email,
        staff_rel.full_name as released_by_name,
        doc.certificate_number
      FROM document_requests r
      JOIN document_types dt ON dt.id = r.document_type_id
      JOIN users u ON u.id = r.user_id
      LEFT JOIN users staff_rel ON staff_rel.id = r.released_by
      LEFT JOIN issued_documents doc ON doc.request_id = r.id
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      sql += ` AND r.created_at >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      sql += ` AND r.created_at <= ?`;
      params.push(endDate + ' 23:59:59');
    }
    if (status && status !== 'ALL') {
      sql += ` AND r.status = ?`;
      params.push(status);
    }
    if (documentTypeId) {
      sql += ` AND r.document_type_id = ?`;
      params.push(documentTypeId);
    }

    sql += ` ORDER BY r.created_at DESC`;

    const transactions = this.db.prepare(sql).all(...params);

    const totalCount = transactions.length;
    const totalRevenue = transactions.reduce((sum, t) => sum + (t.payment_status === 'PAID' ? t.fee : 0), 0);
    const releasedCount = transactions.filter(t => t.status === 'RELEASED').length;

    return {
      transactions,
      summary: {
        totalCount,
        totalRevenue,
        releasedCount
      }
    };
  }

  static getAuditLogs({ limit = 100, action = null } = {}) {
    let sql = `
      SELECT * FROM audit_logs
    `;
    const params = [];

    if (action) {
      sql += ` WHERE action = ?`;
      params.push(action);
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    return this.db.prepare(sql).all(...params);
  }
}

module.exports = ReportService;

