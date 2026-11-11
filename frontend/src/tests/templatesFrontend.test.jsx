import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TemplateValidationReport } from '../pages/admin/doctypes/templates/TemplateValidationReport';
import { TemplateUploadSection } from '../pages/admin/doctypes/templates/TemplateUploadSection';
import { TemplateVersionTable } from '../pages/admin/doctypes/templates/TemplateVersionTable';
import { TemplatePlaceholdersTable } from '../pages/admin/doctypes/templates/TemplatePlaceholdersTable';
import { CertificateTemplatePanel } from '../pages/admin/doctypes/templates/CertificateTemplatePanel';
import { StaffActionButtons } from '../pages/staff/queue/StaffActionButtons';
import { StaffRequestDetailPage } from '../pages/staff/queue/StaffRequestDetailPage';
import { adminService } from '../services/adminService';
import { staffService } from '../services/staffService';
import * as useAuthModule from '../hooks/useAuth';
import * as downloadHelperModule from '../utils/downloadHelper';
import { ApiError } from '../services/apiClient';
import { REQUEST_STATUSES, STAFF_PERMISSIONS } from '../config/constants';
import templatesFixture from './fixtures/templates.json';

describe('DOCX Certificate Templates Frontend Component & Integration Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 1. TemplateValidationReport Component Tests
  // ============================================================================
  describe('TemplateValidationReport Component', () => {
    it('renders valid report state with green success notice and recognized placeholders', () => {
      const report = templatesFixture.uploadSuccess.validation;
      render(<TemplateValidationReport report={report} />);

      expect(screen.getByText(/template validation passed/i)).toBeInTheDocument();
      expect(screen.getByText(/recognized allowlisted placeholders/i)).toBeInTheDocument();
      expect(screen.getByText('{full_name}')).toBeInTheDocument();
      expect(screen.queryByText(/validation errors/i)).not.toBeInTheDocument();
    });

    it('renders invalid report state with red errors and unknown placeholders', () => {
      const report = templatesFixture.uploadInvalid.validation;
      render(<TemplateValidationReport report={report} />);

      expect(screen.getByText(/template validation failed/i)).toBeInTheDocument();
      expect(screen.getByText(/validation errors/i)).toBeInTheDocument();
      expect(screen.getAllByText(/unknown_resident_name/i).length).toBeGreaterThan(0);
    });

    it('renders warnings-only report state with amber notices and no red errors', () => {
      const report = templatesFixture.uploadWarningsOnly.validation;
      render(<TemplateValidationReport report={report} />);

      expect(screen.getByText(/template validation passed/i)).toBeInTheDocument();
      expect(screen.getByText(/template warnings/i)).toBeInTheDocument();
      expect(screen.getByText(/template does not contain \{full_name\}/i)).toBeInTheDocument();
      expect(screen.queryByText(/validation errors/i)).not.toBeInTheDocument();
    });

    it('renders unknown tags with proper alert', () => {
      const report = templatesFixture.uploadInvalid.validation;
      render(<TemplateValidationReport report={report} />);

      expect(screen.getByText(/unknown placeholders found/i)).toBeInTheDocument();
      expect(screen.getAllByText(/unknown_resident_name/i).length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // 2. TemplateUploadSection Component Tests
  // ============================================================================
  describe('TemplateUploadSection Component', () => {
    it('rejects non-.docx file extensions client-side without calling API', async () => {
      const onUploaded = vi.fn();
      const uploadSpy = vi.spyOn(adminService, 'uploadDocumentTemplate');

      render(
        <TemplateUploadSection
          documentTypeId="doc123"
          onTemplateUploaded={onUploaded}
          validationReport={null}
          setValidationReport={vi.fn()}
        />
      );

      const fileInput = screen.getByLabelText(/select docx template file/i);
      const invalidFile = new File(['dummy content'], 'document.pdf', { type: 'application/pdf' });
      fireEvent.change(fileInput, { target: { files: [invalidFile] } });

      expect(await screen.findByText(/invalid file type/i)).toBeInTheDocument();
      expect(uploadSpy).not.toHaveBeenCalled();
      expect(onUploaded).not.toHaveBeenCalled();
    });

    it('rejects files larger than 2MB client-side without calling API', async () => {
      const uploadSpy = vi.spyOn(adminService, 'uploadDocumentTemplate');

      render(
        <TemplateUploadSection
          documentTypeId="doc123"
          onTemplateUploaded={vi.fn()}
          validationReport={null}
          setValidationReport={vi.fn()}
        />
      );

      const fileInput = screen.getByLabelText(/select docx template file/i);
      const oversizedBuffer = new Uint8Array(2.5 * 1024 * 1024);
      const oversizedFile = new File([oversizedBuffer], 'huge-template.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      fireEvent.change(fileInput, { target: { files: [oversizedFile] } });

      expect(await screen.findByText(/file size exceeds/i)).toBeInTheDocument();
      expect(uploadSpy).not.toHaveBeenCalled();
    });

    it('uploads valid .docx, updates validation report, and notifies parent', async () => {
      const onUploaded = vi.fn();
      const setReport = vi.fn();
      vi.spyOn(adminService, 'uploadDocumentTemplate').mockResolvedValue(templatesFixture.uploadSuccess);

      render(
        <TemplateUploadSection
          documentTypeId="doc123"
          onTemplateUploaded={onUploaded}
          validationReport={null}
          setValidationReport={setReport}
        />
      );

      const fileInput = screen.getByLabelText(/select docx template file/i);
      const validFile = new File(['valid docx bytes'], 'template.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      fireEvent.change(fileInput, { target: { files: [validFile] } });

      const uploadBtn = screen.getByRole('button', { name: /upload & validate template/i });
      fireEvent.click(uploadBtn);

      await waitFor(() => {
        expect(setReport).toHaveBeenCalledWith(templatesFixture.uploadSuccess.validation);
        expect(onUploaded).toHaveBeenCalledWith(templatesFixture.uploadSuccess);
      });
    });

    it('catches HTTP 400 ApiError and extracts validation report from err.data.validation', async () => {
      const setReport = vi.fn();
      const apiErr = new ApiError('Template validation failed', 400, null, {
        stored: false,
        validation: templatesFixture.uploadInvalid.validation,
      });
      vi.spyOn(adminService, 'uploadDocumentTemplate').mockRejectedValue(apiErr);

      render(
        <TemplateUploadSection
          documentTypeId="doc123"
          onTemplateUploaded={vi.fn()}
          validationReport={null}
          setValidationReport={setReport}
        />
      );

      const fileInput = screen.getByLabelText(/select docx template file/i);
      const file = new File(['bytes'], 'broken.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      fireEvent.change(fileInput, { target: { files: [file] } });

      const uploadBtn = screen.getByRole('button', { name: /upload & validate template/i });
      fireEvent.click(uploadBtn);

      await waitFor(() => {
        expect(setReport).toHaveBeenCalledWith(templatesFixture.uploadInvalid.validation);
      });
    });
  });

  // ============================================================================
  // 3. TemplateVersionTable Component Tests
  // ============================================================================
  describe('TemplateVersionTable Component', () => {
    it('renders version list with active badge, upload details, size, and QR status', () => {
      const templates = templatesFixture.templatesList;
      render(
        <TemplateVersionTable
          docTypeId="doc123"
          templates={templates}
          onActionSuccess={vi.fn()}
          onError={vi.fn()}
        />
      );

      expect(screen.getByText('Original Filename')).toBeInTheDocument();
      expect(screen.getByText('starter-template.docx')).toBeInTheDocument();
      expect(screen.getByText('warning-template.docx')).toBeInTheDocument();
      expect(screen.getAllByText(/inactive/i).length).toBeGreaterThan(0);
    });

    it('triggers activate API call and invokes onActionSuccess callback', async () => {
      const templates = templatesFixture.templatesList;
      const onSuccess = vi.fn();
      vi.spyOn(adminService, 'activateDocumentTemplate').mockResolvedValue(templatesFixture.activateResponse);

      render(
        <TemplateVersionTable
          docTypeId="doc123"
          templates={templates}
          onActionSuccess={onSuccess}
          onError={vi.fn()}
        />
      );

      // Find an inactive version activate button
      const activateButtons = screen.getAllByRole('button', { name: /activate/i });
      fireEvent.click(activateButtons[0]);

      await waitFor(() => {
        expect(adminService.activateDocumentTemplate).toHaveBeenCalledWith('doc123', expect.any(Number));
        expect(onSuccess).toHaveBeenCalled();
      });
    });

    it('triggers preview download via POST request through downloadBlob', async () => {
      const templates = templatesFixture.templatesList;
      const downloadSpy = vi.spyOn(downloadHelperModule, 'downloadBlob').mockImplementation(() => {});
      vi.spyOn(adminService, 'previewDocumentTemplate').mockResolvedValue({
        blob: new Blob(['docx']),
        filename: 'template-preview-v2.docx',
      });

      render(
        <TemplateVersionTable
          docTypeId="doc123"
          templates={templates}
          onActionSuccess={vi.fn()}
          onError={vi.fn()}
        />
      );

      const previewButtons = screen.getAllByRole('button', { name: /preview/i });
      fireEvent.click(previewButtons[0]);

      await waitFor(() => {
        expect(adminService.previewDocumentTemplate).toHaveBeenCalledWith('doc123', expect.any(Number));
        expect(downloadSpy).toHaveBeenCalled();
      });
    });

    it('handles 409 Conflict when attempting to retire active template and calls onError', async () => {
      const templates = templatesFixture.templatesList;
      const conflictErr = new ApiError('Cannot retire the active template.', 409);
      vi.spyOn(adminService, 'retireDocumentTemplate').mockRejectedValue(conflictErr);
      const onError = vi.fn();

      render(
        <TemplateVersionTable
          docTypeId="doc123"
          templates={templates}
          onActionSuccess={vi.fn()}
          onError={onError}
        />
      );

      const retireButtons = screen.getAllByRole('button', { name: /retire/i });
      fireEvent.click(retireButtons[0]);

      // Confirm in dialog
      const confirmRetireBtn = screen.getByRole('button', { name: /confirm retire/i });
      fireEvent.click(confirmRetireBtn);

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(expect.stringContaining('Cannot retire the active template.'));
      });
    });
  });

  // ============================================================================
  // 4. CertificateTemplatePanel Component Tests
  // ============================================================================
  describe('CertificateTemplatePanel Component', () => {
    it('loads placeholders and templates on mount, and downloads starter template', async () => {
      vi.spyOn(adminService, 'getTemplatePlaceholders').mockResolvedValue(templatesFixture.placeholders);
      vi.spyOn(adminService, 'listDocumentTemplates').mockResolvedValue(templatesFixture.templatesList);
      const downloadSpy = vi.spyOn(downloadHelperModule, 'downloadBlob').mockImplementation(() => {});
      vi.spyOn(adminService, 'downloadStarterTemplate').mockResolvedValue({
        blob: new Blob(['starter']),
        filename: 'starter-certificate-template.docx',
      });

      const docType = {
        _id: 'doc123',
        name: 'Barangay Clearance',
        template_mode: 'builtin',
        active_template_id: null,
      };

      render(
        <MemoryRouter>
          <CertificateTemplatePanel docType={docType} onDocTypeUpdated={vi.fn()} />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/download starter template/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/download starter template/i));
      await waitFor(() => {
        expect(adminService.downloadStarterTemplate).toHaveBeenCalled();
        expect(downloadSpy).toHaveBeenCalled();
      });
    });

    it('opens confirmation modal before switching template mode to builtin', async () => {
      vi.spyOn(adminService, 'getTemplatePlaceholders').mockResolvedValue(templatesFixture.placeholders);
      vi.spyOn(adminService, 'listDocumentTemplates').mockResolvedValue(templatesFixture.templatesList);
      vi.spyOn(adminService, 'setDocumentTypeTemplateMode').mockResolvedValue(templatesFixture.setModeResponse);
      const onUpdated = vi.fn();

      const docType = {
        _id: 'doc123',
        name: 'Barangay Clearance',
        template_mode: 'custom',
        active_template_id: 'temp_active_123',
      };

      render(
        <MemoryRouter>
          <CertificateTemplatePanel docType={docType} onDocTypeUpdated={onUpdated} />
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /switch to built-in/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /switch to built-in/i }));

      const confirmBtn = screen.getByRole('button', { name: /confirm switch/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(adminService.setDocumentTypeTemplateMode).toHaveBeenCalledWith('doc123', 'builtin');
        expect(onUpdated).toHaveBeenCalled();
      });
    });
  });

  // ============================================================================
  // 5. TemplatePlaceholdersTable Component Tests
  // ============================================================================
  describe('TemplatePlaceholdersTable Component', () => {
    it('filters placeholders by keyword search across tags, labels, and groups', () => {
      const placeholders = templatesFixture.placeholders.placeholders;
      render(<TemplatePlaceholdersTable placeholders={placeholders} />);

      expect(screen.getByText(/allowlisted placeholder tags reference/i)).toBeInTheDocument();
      expect(screen.getByText('{full_name}')).toBeInTheDocument();

      // Search filter for tag
      const searchInput = screen.getByPlaceholderText(/filter placeholders/i);
      fireEvent.change(searchInput, { target: { value: 'tracking_number' } });

      expect(screen.getByText('{tracking_number}')).toBeInTheDocument();
      expect(screen.queryByText('{full_name_upper}')).not.toBeInTheDocument();

      // Search filter for group
      fireEvent.change(searchInput, { target: { value: 'request' } });
      expect(screen.getByText('{purpose}')).toBeInTheDocument();
      expect(screen.queryByText('{birthdate_long}')).not.toBeInTheDocument();
    });

    it('copies placeholder tag {key} to clipboard and shows visual feedback', async () => {
      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextSpy },
      });

      const placeholders = templatesFixture.placeholders.placeholders;
      render(<TemplatePlaceholdersTable placeholders={placeholders} />);

      const copyButtons = screen.getAllByRole('button', { name: /copy placeholder/i });
      fireEvent.click(copyButtons[0]);

      expect(writeTextSpy).toHaveBeenCalledWith(expect.stringMatching(/^\{.*\}$/));
      expect(await screen.findByText(/copied!/i)).toBeInTheDocument();
    });
  });

  // ============================================================================
  // 6. Staff Certificate DOCX Download & Issue Warnings Tests
  // ============================================================================
  describe('Staff Request Detail DOCX Certificate Download & Issuance Flow', () => {
    it('shows "Download certificate (DOCX)" button with "Open in Word to print" for custom templates', () => {
      const hasPermission = (p) => p === STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS;
      const onDownloadDocx = vi.fn();

      const request = {
        _id: 'req123',
        status: REQUEST_STATUSES.READY_FOR_PICKUP,
        issued_document: {
          certificate_number: 'BC-2026-00001',
          template_version: 1,
        },
      };

      render(
        <MemoryRouter>
          <StaffActionButtons
            request={request}
            issuedDocument={request.issued_document}
            hasPermission={hasPermission}
            onDownloadDocx={onDownloadDocx}
            onReview={vi.fn()}
            onApprove={vi.fn()}
            onOpenReject={vi.fn()}
            onPrepare={vi.fn()}
            onIssue={vi.fn()}
            onOpenRelease={vi.fn()}
            onArchive={vi.fn()}
            loadingAction={null}
          />
        </MemoryRouter>
      );

      const docxBtn = screen.getByRole('button', { name: /print certificate \(word\)/i });
      expect(docxBtn).toBeInTheDocument();
      expect(docxBtn).toHaveAttribute('title', 'Open in Word to print');

      fireEvent.click(docxBtn);
      expect(onDownloadDocx).toHaveBeenCalledTimes(1);
    });

    it('does NOT show "Print Certificate (Word)" button for built-in layout certificates', () => {
      const hasPermission = (p) => p === STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS;

      const request = {
        _id: 'req123',
        status: REQUEST_STATUSES.READY_FOR_PICKUP,
        issued_document: {
          certificate_number: 'BC-2026-00001',
          template_version: null, // Built-in
        },
      };

      render(
        <MemoryRouter>
          <StaffActionButtons
            request={request}
            issuedDocument={request.issued_document}
            hasPermission={hasPermission}
            onDownloadDocx={vi.fn()}
            onReview={vi.fn()}
            onApprove={vi.fn()}
            onOpenReject={vi.fn()}
            onPrepare={vi.fn()}
            onIssue={vi.fn()}
            onOpenRelease={vi.fn()}
            onArchive={vi.fn()}
            loadingAction={null}
          />
        </MemoryRouter>
      );

      expect(screen.queryByRole('button', { name: /print certificate \(word\)/i })).not.toBeInTheDocument();
    });

    it('handles 409 Conflict when downloading certificate and displays server message in alert banner', async () => {
      vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
        user: { role: 'staff' },
        hasPermission: (p) => p === STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS,
      });

      const conflictErr = new ApiError('Cannot generate certificate: Certificate has been revoked.', 409);
      vi.spyOn(staffService, 'downloadCertificateDocx').mockRejectedValue(conflictErr);

      const detailData = {
        request: {
          _id: 'req123',
          tracking_number: 'QF-2026-0001',
          status: REQUEST_STATUSES.READY_FOR_PICKUP,
          document_type: { name: 'Barangay Clearance' },
          purpose: 'Employment',
          copies: 1,
          fee: 50,
          created_at: new Date().toISOString(),
          processing_notes: [],
          attachments: [],
        },
        citizen_profile: {
          first_name: 'Juan',
          last_name: 'Dela Cruz',
        },
        issued_document: {
          certificate_number: 'BC-2026-00001',
          verification_code: 'V-123456',
          template_version: 1,
          render_data: { full_name: 'SECRET_SNAPSHOT_DATA' },
        },
      };

      vi.spyOn(staffService, 'getRequest').mockResolvedValue(detailData);

      render(
        <MemoryRouter initialEntries={['/staff/requests/req123']}>
          <Routes>
            <Route path="/staff/requests/:id" element={<StaffRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      const docxBtn = await screen.findByRole('button', { name: /print certificate \(word\)/i });
      fireEvent.click(docxBtn);

      expect(await screen.findByText(/cannot generate certificate: certificate has been revoked/i)).toBeInTheDocument();

      // Verify render_data is NEVER rendered in DOM
      expect(screen.queryByText(/SECRET_SNAPSHOT_DATA/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/render_data/i)).not.toBeInTheDocument();
    });

    it('displays non-blocking data_warnings notice after certificate issue when placeholders were empty', async () => {
      vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
        user: { role: 'staff' },
        hasPermission: (p) =>
          p === STAFF_PERMISSIONS.CAN_PREPARE_DOCUMENTS || p === STAFF_PERMISSIONS.CAN_PRINT_DOCUMENTS,
      });

      const issueResponse = templatesFixture.issueWithWarnings;
      vi.spyOn(staffService, 'issueRequest').mockResolvedValue(issueResponse);

      const initialData = {
        request: {
          _id: 'req123',
          tracking_number: 'QF-2026-0001',
          status: REQUEST_STATUSES.IN_PREPARATION,
          document_type: { name: 'Barangay Clearance' },
          purpose: 'Employment',
          copies: 1,
          fee: 50,
          created_at: new Date().toISOString(),
          processing_notes: [],
          attachments: [],
        },
        citizen_profile: {
          first_name: 'Juan',
          last_name: 'Dela Cruz',
        },
        issued_document: null,
      };

      const updatedData = {
        ...initialData,
        request: {
          ...initialData.request,
          status: REQUEST_STATUSES.READY_FOR_PICKUP,
        },
        issued_document: issueResponse.issued_document,
      };

      vi.spyOn(staffService, 'getRequest')
        .mockResolvedValueOnce(initialData)
        .mockResolvedValueOnce(updatedData);

      render(
        <MemoryRouter initialEntries={['/staff/requests/req123']}>
          <Routes>
            <Route path="/staff/requests/:id" element={<StaffRequestDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      const issueBtn = await screen.findByRole('button', { name: /issue & generate certificate/i });
      fireEvent.click(issueBtn);

      await waitFor(() => {
        expect(staffService.issueRequest).toHaveBeenCalledWith('req123');
      });

      // Verify data_warnings notice rendered
      if (issueResponse.data_warnings && issueResponse.data_warnings.length > 0) {
        expect(
          await screen.findByText(new RegExp(issueResponse.data_warnings[0], 'i'))
        ).toBeInTheDocument();
      }
    });
  });
});
