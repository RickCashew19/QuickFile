import { useState } from 'react';
import { adminService } from '../../../../services/adminService';
import { Button } from '../../../../components/shared/Button';
import { Icon } from '../../../../components/shared/Icon';
import { downloadBlob } from '../../../../utils/downloadHelper';
import { formatDate } from '../../../../utils/formatters';

/**
 * Template Versions History Table
 * Supports Activate, Preview (POST download), Download Original, Retire, and Delete actions.
 */
export function TemplateVersionTable({ docTypeId, templates = [], onActionSuccess, onError }) {
  const [busyAction, setBusyAction] = useState(null);

  const runDownload = async (actionKey, downloadFn, fallbackName) => {
    setBusyAction(actionKey);
    try {
      const { blob, filename } = await downloadFn();
      downloadBlob(blob, filename || fallbackName);
    } catch (err) {
      onError(err.message || 'Download failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleActivate = async (version) => {
    setBusyAction(`activate-${version}`);
    try {
      const res = await adminService.activateDocumentTemplate(docTypeId, version);
      onActionSuccess(`Template v${version} activated. Switched to Custom mode.`, res);
    } catch (err) {
      onError(err.message || 'Failed to activate template version.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRetire = async (version) => {
    setBusyAction(`retire-${version}`);
    try {
      const res = await adminService.retireDocumentTemplate(docTypeId, version);
      onActionSuccess(`Template v${version} retired successfully.`, res);
    } catch (err) {
      onError(err.message || 'Failed to retire template version.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDelete = async (version) => {
    if (!window.confirm(`Permanently delete template v${version}?`)) return;
    setBusyAction(`delete-${version}`);
    try {
      await adminService.deleteDocumentTemplate(docTypeId, version);
      onActionSuccess(`Template v${version} deleted successfully.`);
    } catch (err) {
      onError(err.message || 'Failed to delete template version.');
    } finally {
      setBusyAction(null);
    }
  };

  if (!templates || templates.length === 0) {
    return (
      <div style={{ padding: 'var(--space-4)', textAlign: 'center', backgroundColor: 'var(--color-bg)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-sm)' }}>
        No template versions uploaded yet. Upload a .docx file above to get started.
      </div>
    );
  }

  return (
    <div className="qf-admin-table-container" style={{ marginTop: 'var(--space-3)' }}>
      <table className="qf-admin-table" style={{ fontSize: 'var(--font-xs)' }}>
        <thead>
          <tr>
            <th>Version</th>
            <th>Original Filename</th>
            <th>Uploaded By</th>
            <th>Date</th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((tpl) => {
            const isAct = tpl.is_active;
            const isRet = Boolean(tpl.retired_at);
            return (
              <tr key={tpl.id || tpl.version}>
                <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 'bold' }}>v{tpl.version}</td>
                <td>{tpl.original_name}</td>
                <td>{tpl.uploaded_by_name || 'Admin'}</td>
                <td>{formatDate(tpl.created_at)}</td>
                <td>
                  <span style={{ padding: '2px 6px', borderRadius: 'var(--radius-full)', fontWeight: 'bold', fontSize: '11px', backgroundColor: isAct ? '#dcfce7' : isRet ? '#f1f5f9' : '#fef3c7', color: isAct ? '#166534' : isRet ? '#475569' : '#92400e' }}>
                    {isAct ? 'Active' : isRet ? 'Retired' : 'Inactive'}
                  </span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {!isAct && !isRet && (
                      <Button size="sm" variant="ghost" onClick={() => handleActivate(tpl.version)} loading={busyAction === `activate-${tpl.version}`} disabled={Boolean(busyAction)}>
                        Activate
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => runDownload(`preview-${tpl.version}`, () => adminService.previewDocumentTemplate(docTypeId, tpl.version), `template-preview-v${tpl.version}.docx`)} loading={busyAction === `preview-${tpl.version}`} disabled={Boolean(busyAction)}>
                      Preview
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => runDownload(`download-${tpl.version}`, () => adminService.downloadTemplateFile(docTypeId, tpl.version), `template-v${tpl.version}.docx`)} loading={busyAction === `download-${tpl.version}`} disabled={Boolean(busyAction)}>
                      Download
                    </Button>
                    {!isRet && !isAct && (
                      <Button size="sm" variant="ghost" onClick={() => handleRetire(tpl.version)} loading={busyAction === `retire-${tpl.version}`} disabled={Boolean(busyAction)}>
                        Retire
                      </Button>
                    )}
                    {!isAct && (
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(tpl.version)} loading={busyAction === `delete-${tpl.version}`} disabled={Boolean(busyAction)} style={{ color: 'var(--color-danger)' }}>
                        <Icon name="trash" size={14} />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
