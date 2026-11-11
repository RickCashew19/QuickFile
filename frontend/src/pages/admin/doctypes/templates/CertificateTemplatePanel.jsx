import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../../../services/adminService';
import { Button } from '../../../../components/shared/Button';
import { Alert } from '../../../../components/shared/Alert';
import { Loader } from '../../../../components/shared/Loader';
import { Icon } from '../../../../components/shared/Icon';
import { downloadBlob } from '../../../../utils/downloadHelper';
import { TemplateModeBadge } from './TemplateModeBadge';
import { TemplateUploadSection } from './TemplateUploadSection';
import { TemplateValidationReport } from './TemplateValidationReport';
import { TemplateVersionTable } from './TemplateVersionTable';
import { TemplatePlaceholdersTable } from './TemplatePlaceholdersTable';

/**
 * Edit-time Certificate Template Panel
 * Orchestrates mode switches, template uploads, version history, and placeholder catalog.
 */
export function CertificateTemplatePanel({ docType, onDocTypeUpdated }) {
  const docTypeId = docType?._id || docType?.id;
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState([]);
  const [placeholders, setPlaceholders] = useState([]);
  const [currentMode, setCurrentMode] = useState(docType?.template_mode || 'builtin');
  const [activeTemplateId, setActiveTemplateId] = useState(docType?.active_template_id || null);
  const [validationReport, setValidationReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [downloadingStarter, setDownloadingStarter] = useState(false);
  const [switchingMode, setSwitchingMode] = useState(false);

  const fetchTemplateData = useCallback(async () => {
    if (!docTypeId) return;
    try {
      setLoading(true);
      setErrorMsg(null);
      const [tpls, catalog] = await Promise.all([
        adminService.listDocumentTemplates(docTypeId),
        adminService.getTemplatePlaceholders().catch(() => ({ placeholders: [] })),
      ]);
      setTemplates(tpls || []);
      setPlaceholders(catalog?.placeholders || []);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to load templates.');
    } finally {
      setLoading(false);
    }
  }, [docTypeId]);

  useEffect(() => {
    fetchTemplateData();
    setCurrentMode(docType?.template_mode || 'builtin');
    setActiveTemplateId(docType?.active_template_id || null);
  }, [fetchTemplateData, docType]);

  const activeTemplate = templates.find((t) => t.is_active || (activeTemplateId && String(t.id) === String(activeTemplateId)));

  const handleDownloadStarter = async () => {
    setDownloadingStarter(true);
    setErrorMsg(null);
    try {
      const { blob, filename } = await adminService.downloadStarterTemplate();
      downloadBlob(blob, filename || 'starter-certificate-template.docx');
    } catch (err) {
      setErrorMsg(err.message || 'Failed to download starter template.');
    } finally {
      setDownloadingStarter(false);
    }
  };

  const handleSwitchMode = async (targetMode) => {
    if (targetMode === 'builtin') {
      const ok = window.confirm('Switch back to built-in system template? Newly issued certificates will use the standard layout.');
      if (!ok) return;
    }
    setSwitchingMode(true);
    setErrorMsg(null);
    try {
      const res = await adminService.setDocumentTypeTemplateMode(docTypeId, targetMode);
      setCurrentMode(res?.template_mode || targetMode);
      setSuccessMsg(`Document type switched to ${targetMode === 'builtin' ? 'Built-in' : 'Custom'} mode.`);
      if (onDocTypeUpdated) onDocTypeUpdated();
      fetchTemplateData();
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update template mode.');
    } finally {
      setSwitchingMode(false);
    }
  };

  const handleActionSuccess = (msg, activateResult = null) => {
    setSuccessMsg(msg);
    setErrorMsg(null);
    if (activateResult?.template_mode) {
      setCurrentMode(activateResult.template_mode);
      setActiveTemplateId(activateResult.active_template_id);
    }
    if (onDocTypeUpdated) onDocTypeUpdated();
    fetchTemplateData();
  };

  if (loading) {
    return <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}><Loader label="Loading certificate template..." /></div>;
  }

  return (
    <div className="qf-certificate-template-panel" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Mode & Active Version Info Card */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3)', backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: '4px' }}>
            <span style={{ fontSize: 'var(--font-sm)', fontWeight: 'bold' }}>Template Mode:</span>
            <TemplateModeBadge docType={{ template_mode: currentMode }} activeVersion={activeTemplate?.version} />
          </div>
          <p style={{ margin: 0, fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
            {currentMode === 'custom'
              ? `Using Custom Template v${activeTemplate?.version || ''} (${activeTemplate?.original_name || 'Active'}).`
              : 'Using built-in system layout. Upload and activate a custom DOCX template below.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <Button size="sm" variant={currentMode === 'custom' ? 'secondary' : 'primary'} onClick={() => handleSwitchMode(currentMode === 'custom' ? 'builtin' : 'custom')} loading={switchingMode} disabled={switchingMode}>
            {currentMode === 'custom' ? 'Switch to Built-in' : 'Switch to Custom'}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDownloadStarter} loading={downloadingStarter} disabled={downloadingStarter} iconLeft={<Icon name="download" size={14} />}>
            Download Starter Template
          </Button>
        </div>
      </div>

      {successMsg && <Alert variant="success" onClose={() => setSuccessMsg(null)}>{successMsg}</Alert>}
      {errorMsg && <Alert variant="danger" onClose={() => setErrorMsg(null)}>{errorMsg}</Alert>}

      <TemplateUploadSection docTypeId={docTypeId} onUploadSuccess={(res) => handleActionSuccess(`Template v${res.template?.version} uploaded. Click Activate to make it active.`, null)} onReport={setValidationReport} />
      {validationReport && <TemplateValidationReport report={validationReport} onClose={() => setValidationReport(null)} />}
      <h4 style={{ margin: 'var(--space-2) 0 var(--space-1) 0', fontSize: 'var(--font-sm)', fontWeight: 'bold' }}>Template Versions History</h4>
      <TemplateVersionTable docTypeId={docTypeId} templates={templates} onActionSuccess={handleActionSuccess} onError={setErrorMsg} />
      <TemplatePlaceholdersTable placeholders={placeholders} />
    </div>
  );
}
