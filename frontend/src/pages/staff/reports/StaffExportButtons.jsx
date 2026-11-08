import { useState } from 'react';
import { staffService } from '../../../services/staffService';
import { downloadBlob } from '../../../utils/downloadHelper';
import { Button } from '../../../components/shared/Button';
import { Icon } from '../../../components/shared/Icon';

export function StaffExportButtons({ filters, onNotice, onError, disabled = false }) {
  const [downloadingFormat, setDownloadingFormat] = useState(null);

  const handleExport = async (format) => {
    setDownloadingFormat(format);
    onNotice(null);
    onError(null);
    try {
      const { blob, filename, truncated } = await staffService.exportReport({
        format,
        from: filters.from,
        to: filters.to,
        document_type_id: filters.document_type_id,
      });

      downloadBlob(blob, filename);

      if (truncated) {
        onNotice('Export record limit reached. The downloaded report contains the maximum allowed rows.');
      }
    } catch (err) {
      onError(err.message || `Failed to export ${format.toUpperCase()} report.`);
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <div className="qf-export-buttons-group" role="group" aria-label="Export report data">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => handleExport('pdf')}
        loading={downloadingFormat === 'pdf'}
        disabled={disabled || Boolean(downloadingFormat)}
        aria-label="Export report as PDF document"
      >
        <Icon name="download" size={16} />
        <span>Export PDF</span>
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => handleExport('docx')}
        loading={downloadingFormat === 'docx'}
        disabled={disabled || Boolean(downloadingFormat)}
        aria-label="Export report as Word document"
      >
        <Icon name="download" size={16} />
        <span>Export Word (.docx)</span>
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={() => handleExport('xlsx')}
        loading={downloadingFormat === 'xlsx'}
        disabled={disabled || Boolean(downloadingFormat)}
        aria-label="Export report as Excel spreadsheet"
      >
        <Icon name="download" size={16} />
        <span>Export Excel (.xlsx)</span>
      </Button>
    </div>
  );
}
