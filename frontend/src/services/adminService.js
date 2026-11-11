import { apiClient } from './apiClient';

/**
 * System Administration API Service
 * Centralizes all admin operations: Executive dashboard & real-time live-stats,
 * staff management, citizen registry, document types catalog, records management,
 * issued certificate control, read-only audit trails, and system settings.
 */
export const adminService = {
  // ==============================================================================
  // 1. Dashboard & Live Stats
  // ==============================================================================

  /**
   * Retrieves high-level executive dashboard metrics, revenue, and queue distribution
   */
  async getDashboard() {
    return apiClient.get('/admin/dashboard');
  },

  /**
   * High-frequency polling endpoint for live operational stats (exempt from standard rate limit)
   */
  async getLiveStats() {
    return apiClient.get('/admin/live-stats');
  },

  // ==============================================================================
  // 2. Staff Management
  // ==============================================================================

  /**
   * Lists staff directory with pagination and filters
   */
  async listStaff(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.is_active !== undefined && params.is_active !== 'all') {
      query.set('is_active', params.is_active);
    }
    if (params.search && params.search.trim()) {
      query.set('search', params.search.trim());
    }

    const qs = query.toString();
    return apiClient.get(`/admin/staff${qs ? `?${qs}` : ''}`);
  },

  /**
   * Retrieves single staff member details by user ID
   */
  async getStaffById(id) {
    return apiClient.get(`/admin/staff/${encodeURIComponent(id)}`);
  },

  /**
   * Provisions a new staff account with granular permissions
   */
  async createStaff(payload) {
    return apiClient.post('/admin/staff', payload);
  },

  /**
   * Updates basic profile information for a staff member
   */
  async updateStaff(id, payload) {
    return apiClient.put(`/admin/staff/${encodeURIComponent(id)}`, payload);
  },

  /**
   * Activates or deactivates a staff member account
   */
  async updateStaffStatus(id, isActive) {
    return apiClient.patch(`/admin/staff/${encodeURIComponent(id)}/status`, {
      is_active: Boolean(isActive),
    });
  },

  /**
   * Updates granular workflow permissions for a staff member
   */
  async updateStaffPermissions(id, permissions) {
    return apiClient.put(`/admin/staff/${encodeURIComponent(id)}/permissions`, permissions);
  },

  /**
   * Resets staff member password
   */
  async resetStaffPassword(id, newPassword) {
    return apiClient.post(`/admin/staff/${encodeURIComponent(id)}/reset-password`, {
      new_password: newPassword,
    });
  },

  /**
   * Permanently deletes a staff account (requires typed DELETE confirmation)
   */
  async deleteStaff(id) {
    return apiClient.delete(`/admin/staff/${encodeURIComponent(id)}`, {
      confirm: 'DELETE',
    });
  },

  // ==============================================================================
  // 3. Citizen Registry
  // ==============================================================================

  /**
   * Lists citizen directory with pagination and filters
   */
  async listCitizens(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.is_active !== undefined && params.is_active !== 'all') {
      query.set('is_active', params.is_active);
    }
    if (params.verification_status && params.verification_status !== 'all') {
      query.set('verification_status', params.verification_status);
    }
    if (params.search && params.search.trim()) {
      query.set('search', params.search.trim());
    }

    const qs = query.toString();
    return apiClient.get(`/admin/citizens${qs ? `?${qs}` : ''}`);
  },

  /**
   * Activates or deactivates a citizen account
   */
  async updateCitizenStatus(id, isActive) {
    return apiClient.patch(`/admin/citizens/${encodeURIComponent(id)}/status`, {
      is_active: Boolean(isActive),
    });
  },

  /**
   * Permanently deletes a citizen account and associated files (requires typed DELETE confirmation)
   */
  async deleteCitizen(id) {
    return apiClient.delete(`/admin/citizens/${encodeURIComponent(id)}`, {
      confirm: 'DELETE',
    });
  },

  // ==============================================================================
  // 4. Document Types Catalog
  // ==============================================================================

  /**
   * Lists all available document types including inactive definitions
   */
  async getAllDocumentTypes() {
    return apiClient.get('/admin/document-types');
  },

  /**
   * Retrieves single document type definition by ID
   */
  async getDocumentTypeById(id) {
    return apiClient.get(`/admin/document-types/${encodeURIComponent(id)}`);
  },

  /**
   * Creates a new document type catalog item
   */
  async createDocumentType(payload) {
    return apiClient.post('/admin/document-types', payload);
  },

  /**
   * Updates an existing document type catalog item
   */
  async updateDocumentType(id, payload) {
    return apiClient.put(`/admin/document-types/${encodeURIComponent(id)}`, payload);
  },

  /**
   * Deletes a document type (blocked if referenced by existing requests)
   */
  async deleteDocumentType(id) {
    return apiClient.delete(`/admin/document-types/${encodeURIComponent(id)}`, {
      confirm: 'DELETE',
    });
  },

  // ==============================================================================
  // 4b. Certificate DOCX Templates
  // ==============================================================================

  /**
   * Retrieves the allowlisted placeholders catalog
   */
  async getTemplatePlaceholders() {
    return apiClient.get('/admin/template-placeholders');
  },

  /**
   * Downloads the starter certificate DOCX template
   */
  async downloadStarterTemplate() {
    return apiClient.download('/admin/template-starter');
  },

  /**
   * Lists all uploaded template versions for a given document type
   */
  async listDocumentTemplates(documentTypeId) {
    return apiClient.get(`/admin/document-types/${encodeURIComponent(documentTypeId)}/templates`);
  },

  /**
   * Uploads and validates a new DOCX certificate template (multipart/form-data)
   */
  async uploadDocumentTemplate(documentTypeId, file) {
    const formData = new FormData();
    formData.append('template', file);
    return apiClient.post(`/admin/document-types/${encodeURIComponent(documentTypeId)}/templates`, formData);
  },

  /**
   * Activates a specific template version for a document type
   */
  async activateDocumentTemplate(documentTypeId, version) {
    return apiClient.post(
      `/admin/document-types/${encodeURIComponent(documentTypeId)}/templates/${encodeURIComponent(version)}/activate`,
      {}
    );
  },

  /**
   * Switches template mode for a document type ('builtin' | 'custom')
   */
  async setDocumentTypeTemplateMode(documentTypeId, mode) {
    return apiClient.post(
      `/admin/document-types/${encodeURIComponent(documentTypeId)}/template-mode`,
      { mode }
    );
  },

  /**
   * Downloads a sample rendered preview of the template (POST returning a binary blob)
   */
  async previewDocumentTemplate(documentTypeId, version) {
    return apiClient.download(
      `/admin/document-types/${encodeURIComponent(documentTypeId)}/templates/${encodeURIComponent(version)}/preview`,
      { method: 'POST' }
    );
  },

  /**
   * Downloads the original uploaded DOCX template file
   */
  async downloadTemplateFile(documentTypeId, version) {
    return apiClient.download(
      `/admin/document-types/${encodeURIComponent(documentTypeId)}/templates/${encodeURIComponent(version)}/file`
    );
  },

  /**
   * Retires an inactive template version (blocked with 409 if active)
   */
  async retireDocumentTemplate(documentTypeId, version) {
    return apiClient.post(
      `/admin/document-types/${encodeURIComponent(documentTypeId)}/templates/${encodeURIComponent(version)}/retire`,
      {}
    );
  },

  /**
   * Deletes an unused template version (blocked with 409 if used by issued certificate)
   */
  async deleteDocumentTemplate(documentTypeId, version) {
    return apiClient.delete(
      `/admin/document-types/${encodeURIComponent(documentTypeId)}/templates/${encodeURIComponent(version)}`
    );
  },

  // ==============================================================================
  // 5. Records & Requests Management
  // ==============================================================================

  /**
   * Lists all system records across all statuses
   */
  async listRecords(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.document_type_id) query.set('document_type_id', params.document_type_id);
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.search && params.search.trim()) query.set('search', params.search.trim());

    const qs = query.toString();
    return apiClient.get(`/admin/records${qs ? `?${qs}` : ''}`);
  },

  /**
   * Retrieves full request processing details
   */
  async getRequestDetails(id) {
    return apiClient.get(`/admin/requests/${encodeURIComponent(id)}`);
  },

  /**
   * Permanently deletes a request and attachments (requires typed DELETE confirmation)
   */
  async deleteRequest(id) {
    return apiClient.delete(`/admin/requests/${encodeURIComponent(id)}`, {
      confirm: 'DELETE',
    });
  },

  // ==============================================================================
  // 6. Issued Documents & Certificates
  // ==============================================================================

  /**
   * Lists issued certificates with status filters (valid, expired, revoked)
   */
  async listIssuedDocuments(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.search && params.search.trim()) query.set('search', params.search.trim());

    const qs = query.toString();
    return apiClient.get(`/admin/issued-documents${qs ? `?${qs}` : ''}`);
  },

  /**
   * Revokes an issued document certificate
   */
  async revokeIssuedDocument(id, reason) {
    return apiClient.post(`/admin/issued-documents/${encodeURIComponent(id)}/revoke`, {
      reason,
    });
  },

  /**
   * Reinstates a revoked document certificate back to valid
   */
  async reinstateIssuedDocument(id) {
    return apiClient.post(`/admin/issued-documents/${encodeURIComponent(id)}/reinstate`, {});
  },

  /**
   * Deletes an issued document record permanently (requires typed DELETE confirmation)
   */
  async deleteIssuedDocument(id) {
    return apiClient.delete(`/admin/issued-documents/${encodeURIComponent(id)}`, {
      confirm: 'DELETE',
    });
  },

  // ==============================================================================
  // 7. Audit Trail (Read-only)
  // ==============================================================================

  /**
   * Lists immutable system audit logs with filters
   */
  async listAuditLogs(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.module && params.module !== 'all') query.set('module', params.module);
    if (params.action && params.action.trim()) query.set('action', params.action.trim());
    if (params.actor_name && params.actor_name.trim()) {
      query.set('actor_name', params.actor_name.trim());
    }
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);

    const qs = query.toString();
    return apiClient.get(`/admin/audit-logs${qs ? `?${qs}` : ''}`);
  },

  // ==============================================================================
  // 8. System Settings & Super Admin Flow
  // ==============================================================================

  /**
   * Retrieves masked integration configs and app settings
   */
  async getSettings() {
    return apiClient.get('/admin/settings');
  },

  /**
   * Updates custom integration settings guarded by Super Admin Key
   */
  async updateCustomSettings({ su_admin_key, settings = {}, reset_keys = [] }) {
    return apiClient.patch('/admin/settings', {
      su_admin_key,
      settings,
      reset_keys,
    });
  },

  /**
   * Updates feature toggles (Google login, reCAPTCHA, SMS, email, REST gateway)
   */
  async updateToggles(toggles) {
    return apiClient.patch('/admin/settings/toggles', toggles);
  },

  /**
   * Updates general barangay information and signatories
   */
  async updateGeneralSettings(general) {
    return apiClient.patch('/admin/settings/general', general);
  },

  // ==============================================================================
  // 9. Executive Reports & Export
  // ==============================================================================

  /**
   * Generates structured report summary data
   */
  async getReports(params = {}) {
    const query = new URLSearchParams();
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.document_type_id && params.document_type_id !== 'all') {
      query.set('document_type_id', params.document_type_id);
    }

    const qs = query.toString();
    return apiClient.get(`/admin/reports${qs ? `?${qs}` : ''}`);
  },

  /**
   * Downloads official report in PDF, DOCX, or XLSX format
   */
  async exportReport(params = {}) {
    const query = new URLSearchParams();
    query.set('format', params.format || 'pdf');
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.document_type_id && params.document_type_id !== 'all') {
      query.set('document_type_id', params.document_type_id);
    }

    return apiClient.download(`/admin/reports/export?${query.toString()}`);
  },
};
