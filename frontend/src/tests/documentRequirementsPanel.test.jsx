import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DocumentRequirementsPanel } from '../components/shared/DocumentRequirementsPanel';
import { CitizenNewRequestPage } from '../pages/citizen/requests/CitizenNewRequestPage';
import { citizenService } from '../api/citizenService';

vi.mock('../api/citizenService', () => ({
  citizenService: {
    getCatalog: vi.fn(),
    getProfileReuseData: vi.fn(),
  },
}));

vi.mock('../api/requestService', () => ({
  requestService: {
    createRequest: vi.fn(),
  },
}));

describe('DocumentRequirementsPanel', () => {
  it('lists the selected document requirements', () => {
    render(
      <DocumentRequirementsPanel
        requirements={['Valid Government ID', 'Proof of Residency']}
      />
    );

    expect(screen.getByText('Standard Requirements')).toBeTruthy();
    expect(screen.getByText('Valid Government ID')).toBeTruthy();
    expect(screen.getByText('Proof of Residency')).toBeTruthy();
  });

  it('shows a fallback when the document has no requirements', () => {
    render(<DocumentRequirementsPanel requirements={[]} />);
    expect(screen.getByText('No special requirements for this document.')).toBeTruthy();
  });

  it('shows a custom title for the staff walk-in variant', () => {
    render(
      <DocumentRequirementsPanel
        requirements={['Valid Government ID']}
        title="Requirements to collect from resident"
      />
    );
    expect(screen.getByText('Requirements to collect from resident')).toBeTruthy();
  });
});

describe('Citizen new request page requirements reminder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    citizenService.getProfileReuseData.mockResolvedValue(null);
  });

  it('shows requirements for the preselected document type', async () => {
    citizenService.getCatalog.mockResolvedValue([
      {
        _id: 'doc-1',
        code: 'CLR',
        name: 'Barangay Clearance',
        fee: 50,
        requirements: ['Valid Government ID', 'Proof of Residency'],
        missing_fields: [],
      },
      {
        _id: 'doc-2',
        code: 'AGE',
        name: 'Age Certification',
        fee: 0,
        requirements: [],
        missing_fields: [],
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/citizen/requests/new?type=doc-1']}>
        <CitizenNewRequestPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Valid Government ID')).toBeTruthy();
      expect(screen.getByText('Proof of Residency')).toBeTruthy();
    });
    expect(screen.getByTestId('document-requirements')).toBeTruthy();
  });

  it('shows no reminder before a document type is selected', async () => {
    citizenService.getCatalog.mockResolvedValue([
      {
        _id: 'doc-1',
        code: 'CLR',
        name: 'Barangay Clearance',
        fee: 50,
        requirements: ['Valid Government ID'],
        missing_fields: [],
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/citizen/requests/new']}>
        <CitizenNewRequestPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(citizenService.getCatalog).toHaveBeenCalled());
    expect(screen.queryByTestId('document-requirements')).toBeNull();
  });
});
