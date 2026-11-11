import { apiClient } from './apiClient';

/**
 * Staff Portal API Service
 * Centralizes all HTTP operations for staff dashboard, document processing,
 * walk-in filing, records, verification, and reports.
 */
export const staffService = {
  /**
   * Retrieves high-level dashboard metrics (counts by status, today's totals)
   */
  async getDashboard() {
    return apiClient.get('/staff/dashboard');
  },

  /**
   * Lightweight stats polling endpoint (exempt from standard rate limit)
   */
  async getLiveStats() {
    return apiClient.get('/staff/requests/live-stats');
  },

  /**
   * Lists requests for staff review queue with filtering and pagination
   */
  async listRequests(params = {}) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.document_type_id) query.set('document_type_id', params.document_type_id);
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.search && params.search.trim()) query.set('search', params.search.trim());

    const qs = query.toString();
    return apiClient.get(`/staff/requests${qs ? `?${qs}` : ''}`);
  },

  /**
   * Retrieves comprehensive request details (notes, audit history, citizen info)
   */
  async getRequest(id) {
    return apiClient.get(`/staff/requests/${encodeURIComponent(id)}`);
  },

  /**
   * Appends an internal staff processing note to the request
   */
  async appendNotes(id, note) {
    return apiClient.post(`/staff/requests/${encodeURIComponent(id)}/notes`, { note });
  },

  /**
   * Transitions pending request to under_review
   */
  async reviewRequest(id) {
    return apiClient.post(`/staff/requests/${encodeURIComponent(id)}/review`, {});
  },

  /**
   * Transitions under_review request to approved
   */
  async approveRequest(id) {
    return apiClient.post(`/staff/requests/${encodeURIComponent(id)}/approve`, {});
  },

  /**
   * Rejects a pending or under_review request with a mandatory reason
   */
  async rejectRequest(id, rejectionReason) {
    return apiClient.post(`/staff/requests/${encodeURIComponent(id)}/reject`, {
      rejection_reason: rejectionReason,
    });
  },

  /**
   * Transitions approved request to in_preparation
   */
  async prepareRequest(id) {
    return apiClient.post(`/staff/requests/${encodeURIComponent(id)}/prepare`, {});
  },

  /**
   * Issues document: in_preparation -> ready_for_pickup (generates certificate and QR code)
   */
  async issueRequest(id) {
    return apiClient.post(`/staff/requests/${encodeURIComponent(id)}/issue`, {});
  },

  /**
   * Retrieves official certificate print data (signatories, citizen, barangay info)
   */
  async getPrintData(id) {
    return apiClient.get(`/staff/requests/${encodeURIComponent(id)}/print-data`);
  },

  /**
   * Releases document to citizen: ready_for_pickup -> released
   */
  async releaseRequest(id, paymentData = {}) {
    return apiClient.post(`/staff/requests/${encodeURIComponent(id)}/release`, paymentData);
  },

  /**
   * Archives a terminal request (released, rejected, cancelled)
   */
  async archiveRequest(id) {
    return apiClient.post(`/staff/requests/${encodeURIComponent(id)}/archive`, {});
  },

  /**
   * Lists archived and released records
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
    return apiClient.get(`/staff/records${qs ? `?${qs}` : ''}`);
  },

  /**
   * Searches active resident citizens by name, email, or phone (min 3 characters)
   */
  async searchResidents(search) {
    return apiClient.get(`/staff/residents?search=${encodeURIComponent(search || '')}`);
  },

  /**
   * Submits a walk-in request on behalf of a citizen (multipart/form-data)
   */
  async createWalkIn(formData) {
    return apiClient.post('/staff/requests/walk-in', formData);
  },

  /**
   * Retrieves aggregated staff reports data
   */
  async getReports(params = {}) {
    const query = new URLSearchParams();
    if (params.from) query.set('from', params.from);
    if (params.to) query.set('to', params.to);
    if (params.document_type_id) query.set('document_type_id', params.document_type_id);
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);

    const qs = query.toString();
    return apiClient.get(`/staff/reports${qs ? `?${qs}` : ''}`);
  },

  /**
   * Downloads staff report export in PDF, DOCX, or XLSX format using binary stream downloader
   */
  async exportReport({ format = 'pdf', from, to, document_type_id }) {
    const query = new URLSearchParams();
    query.set('format', format);
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (document_type_id) query.set('document_type_id', document_type_id);

    return apiClient.download(`/staff/reports/export?${query.toString()}`);
  },

  /**
   * Verifies document by QR code or verification code with full audit logging
   */
  async verifyCode(code) {
    return apiClient.get(`/staff/verify/${encodeURIComponent(code || '')}`);
  },

  /**
   * Downloads official certificate DOCX for requests issued with custom templates
   */
  async downloadCertificateDocx(id) {
    return apiClient.download(`/staff/requests/${encodeURIComponent(id)}/certificate?format=docx`);
  },
};
