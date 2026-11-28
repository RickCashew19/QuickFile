import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from '../pages/public/LandingPage';
import { publicService } from '../api/publicService';

vi.mock('../api/publicService', () => ({
  publicService: {
    getConfig: vi.fn(),
    getDocumentTypes: vi.fn(),
  },
}));

describe('LandingPage document services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publicService.getConfig.mockResolvedValue({
      barangay_name: 'Test Barangay',
      city_municipality: 'Test City',
      province: 'Test Province',
    });
  });

  it('renders every active document type and never shows hardcoded inactive services', async () => {
    publicService.getDocumentTypes.mockResolvedValue([
      {
        _id: '1',
        code: 'BC',
        name: 'Barangay Clearance',
        description: 'Employment clearance',
        fee: 50,
        processing_days: 1,
      },
      {
        _id: '2',
        code: 'INDIGENCY',
        name: 'Certificate of Indigency',
        description: 'Medical and social aid',
        fee: 0,
        processing_days: 2,
      },
    ]);

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Barangay Clearance' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Certificate of Indigency' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Certificate of Residency' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Business Clearance' })).toBeNull();
    expect(screen.getByText('Medical and social aid')).toBeInTheDocument();

    await waitFor(() => {
      expect(publicService.getDocumentTypes).toHaveBeenCalledTimes(1);
    });
  });

  it('shows an empty message when there are no active types', async () => {
    publicService.getDocumentTypes.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText('No document services are currently available. Please check back later.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Barangay Clearance' })).toBeNull();
  });

  it('does not fall back to hardcoded services when the catalog request fails', async () => {
    publicService.getDocumentTypes.mockRejectedValue(new Error('Network offline'));

    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );

    expect(
      await screen.findByText('No document services are currently available. Please check back later.')
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Barangay Clearance' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Certificate of Residency' })).toBeNull();
  });
});
