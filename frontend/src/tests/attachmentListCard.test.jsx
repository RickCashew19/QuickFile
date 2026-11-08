import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AttachmentListCard } from '../pages/staff/queue/AttachmentListCard';
import { apiClient } from '../services/apiClient';

describe('AttachmentListCard & useAttachmentBlob Suite', () => {
  const mockAttachments = [
    {
      _id: 'att_1',
      original_name: 'barangay_id.png',
      stored_filename: 'store_12345.png',
      mime_type: 'image/png',
      file_size: 204800, // 200 KB
      path: 'store_12345.png',
    },
    {
      _id: 'att_2',
      original_name: 'lease_contract.pdf',
      stored_filename: 'store_67890.pdf',
      mime_type: 'application/pdf',
      file_size: 512000, // 500 KB
      path: 'store_67890.pdf',
    },
  ];

  let createObjectURLSpy;
  let revokeObjectURLSpy;

  beforeEach(() => {
    vi.restoreAllMocks();
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url-123');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it('renders nothing when attachments array is empty or null', () => {
    const { container: c1 } = render(<AttachmentListCard attachments={[]} />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<AttachmentListCard attachments={null} />);
    expect(c2.firstChild).toBeNull();
  });

  it('renders attachment items with real fields and formatted file size', () => {
    render(<AttachmentListCard attachments={mockAttachments} />);

    expect(screen.getByText(/barangay_id\.png/i)).toBeInTheDocument();
    expect(screen.getByText(/200 KB/i)).toBeInTheDocument();

    expect(screen.getByText(/lease_contract\.pdf/i)).toBeInTheDocument();
    expect(screen.getByText(/500 KB/i)).toBeInTheDocument();

    // Image has Preview and Download buttons
    expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument();
    // Two download buttons (one for image, one for PDF)
    const downloadButtons = screen.getAllByRole('button', { name: /download/i });
    expect(downloadButtons).toHaveLength(2);
  });

  it('calls apiClient.download and creates object URL when downloading an attachment', async () => {
    const fakeBlob = new Blob(['sample data'], { type: 'image/png' });
    vi.spyOn(apiClient, 'download').mockResolvedValue({
      blob: fakeBlob,
      filename: 'store_12345.png',
      truncated: false,
    });

    render(<AttachmentListCard attachments={mockAttachments} />);

    const downloadButtons = screen.getAllByRole('button', { name: /download/i });
    fireEvent.click(downloadButtons[0]);

    await waitFor(() => {
      expect(apiClient.download).toHaveBeenCalledWith('/files/attachments/store_12345.png');
      expect(createObjectURLSpy).toHaveBeenCalledWith(fakeBlob);
    });
  });

  it('previews image attachment in a Modal dialog with focus trap', async () => {
    const fakeBlob = new Blob(['image data'], { type: 'image/png' });
    vi.spyOn(apiClient, 'download').mockResolvedValue({
      blob: fakeBlob,
      filename: 'store_12345.png',
      truncated: false,
    });

    render(<AttachmentListCard attachments={mockAttachments} />);

    const previewBtn = screen.getByRole('button', { name: /preview/i });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(apiClient.download).toHaveBeenCalledWith('/files/attachments/store_12345.png');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: /barangay_id\.png/i })).toBeInTheDocument();
    });

    // Close preview modal
    const closeBtn = screen.getByRole('button', { name: /close preview/i });
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url-123');
    });
  });

  it('triggers download for PDF attachments instead of inline modal preview', async () => {
    const fakeBlob = new Blob(['pdf binary'], { type: 'application/pdf' });
    vi.spyOn(apiClient, 'download').mockResolvedValue({
      blob: fakeBlob,
      filename: 'store_67890.pdf',
      truncated: false,
    });

    render(<AttachmentListCard attachments={mockAttachments} />);

    // The PDF item has only the Download button
    const downloadButtons = screen.getAllByRole('button', { name: /download/i });
    fireEvent.click(downloadButtons[1]); // PDF download button

    await waitFor(() => {
      expect(apiClient.download).toHaveBeenCalledWith('/files/attachments/store_67890.pdf');
      expect(createObjectURLSpy).toHaveBeenCalledWith(fakeBlob);
    });

    // Should NOT open a modal
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('displays Alert with error message when apiClient.download rejects', async () => {
    vi.spyOn(apiClient, 'download').mockRejectedValue(new Error('Network stream interrupted'));

    render(<AttachmentListCard attachments={mockAttachments} />);

    const downloadButtons = screen.getAllByRole('button', { name: /download/i });
    fireEvent.click(downloadButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Network stream interrupted')).toBeInTheDocument();
    });
  });

  it('revokes all allocated blob object URLs on unmount', async () => {
    const fakeBlob = new Blob(['data'], { type: 'image/png' });
    vi.spyOn(apiClient, 'download').mockResolvedValue({
      blob: fakeBlob,
      filename: 'store_12345.png',
      truncated: false,
    });

    const { unmount } = render(<AttachmentListCard attachments={mockAttachments} />);

    const previewBtn = screen.getByRole('button', { name: /preview/i });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(createObjectURLSpy).toHaveBeenCalledWith(fakeBlob);
    });

    // Unmount the component
    unmount();

    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });
});
