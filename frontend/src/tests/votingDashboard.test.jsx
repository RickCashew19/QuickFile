import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IVoteDashboardPage } from '../pages/voting/IVoteDashboardPage';
import { ToastProvider } from '../contexts/ToastContext';
import * as useAuthModule from '../hooks/useAuth';

describe('iVOTE Dashboard & Voting System UI/UX Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { full_name: 'Juan Dela Cruz', email: 'juan@student.edu.ph' },
      logout: vi.fn(),
    });
  });

  const renderDashboard = () =>
    render(
      <MemoryRouter>
        <ToastProvider>
          <IVoteDashboardPage />
        </ToastProvider>
      </MemoryRouter>
    );

  it('renders all 5 core dashboard cards with matching visual structure', () => {
    renderDashboard();

    // 1. Sidebar Brand & Profile
    expect(screen.getAllByLabelText('iVOTE')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Juan Dela Cruz')[0]).toBeInTheDocument();

    // 2. Card 1: Wide Hero Card
    expect(screen.getByText('Ongoing Elections')).toBeInTheDocument();
    expect(screen.getAllByText('President Student Council').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /vote now/i })).toBeInTheDocument();

    // 3. Card 2: Calendar Card
    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Next week' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'This Month' })).toBeInTheDocument();

    // 4. Card 3: Live Results Card
    expect(screen.getByRole('heading', { name: 'Live Results' })).toBeInTheDocument();
    expect(screen.getByText('Candidate #1')).toBeInTheDocument();
    expect(screen.getByText('Candidate #2')).toBeInTheDocument();
    expect(screen.getByText('Candidate #3')).toBeInTheDocument();
    expect(screen.getByText('53%')).toBeInTheDocument();

    // 5. Card 4: Voting Process Card
    expect(screen.getByRole('heading', { name: 'Voting Process' })).toBeInTheDocument();
    expect(screen.getByText('362')).toBeInTheDocument();
    expect(screen.getByText(/total number of registered voters/i)).toBeInTheDocument();

    // 6. Card 5: Election Activities Card
    expect(screen.getByRole('heading', { name: 'Election Activities' })).toBeInTheDocument();
    expect(screen.getAllByText('Ongoing')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Pending')[0]).toBeInTheDocument();
    expect(screen.getAllByText('Concluded')[0]).toBeInTheDocument();
  });

  it('provides a search field with clear (x) button when text is entered', async () => {
    const user = userEvent.setup();
    renderDashboard();

    const searchInput = screen.getByRole('textbox', { name: /search/i });
    expect(searchInput).toBeInTheDocument();
    expect(screen.queryByLabelText('Clear search text')).not.toBeInTheDocument();

    await user.type(searchInput, 'Morgan');
    expect(searchInput).toHaveValue('Morgan');
    const clearBtn = screen.getByLabelText('Clear search text');
    expect(clearBtn).toBeInTheDocument();

    await user.click(clearBtn);
    expect(searchInput).toHaveValue('');
    expect(screen.queryByLabelText('Clear search text')).not.toBeInTheDocument();
  });

  it('completes the voting flow with candidate selection, confirmation modal, and digital receipt', async () => {
    const user = userEvent.setup();
    renderDashboard();

    // 1. Click "Vote now"
    const voteNowBtn = screen.getByRole('button', { name: /vote now/i });
    await user.click(voteNowBtn);

    // 2. Ballot Modal appears with selectable candidate cards
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Alex Morgan')).toBeInTheDocument();
    expect(screen.getByText('Beatrice Vance')).toBeInTheDocument();
    expect(screen.getByText('Carlos Reyes')).toBeInTheDocument();

    // "Submit vote" button is initially disabled
    const submitBtn = screen.getByRole('button', { name: /submit vote/i });
    expect(submitBtn).toBeDisabled();

    // 3. Select Alex Morgan
    const alexCard = screen.getByRole('radio', { name: /alex morgan/i });
    await user.click(alexCard);
    expect(alexCard).toHaveAttribute('aria-checked', 'true');
    expect(submitBtn).not.toBeDisabled();

    // 4. Click "Submit vote" to trigger explicit Confirmation Dialog
    await user.click(submitBtn);
    expect(screen.getByText('Confirm Your Vote')).toBeInTheDocument();
    expect(
      screen.getByText(/are you sure you want to cast your official vote for alex morgan/i)
    ).toBeInTheDocument();

    // 5. Confirm and Cast Vote
    const confirmCastBtn = screen.getByRole('button', { name: 'Confirm & Cast Vote' });
    await user.click(confirmCastBtn);

    // 6. Receipt appears with confirmation code & cryptographic proof
    await waitFor(() => {
      expect(screen.getByText('Vote Recorded Successfully!')).toBeInTheDocument();
    });
    expect(screen.getByText(/confirmation number:/i)).toBeInTheDocument();
    expect(screen.getByText(/alex morgan/i)).toBeInTheDocument();

    // 7. Close ballot and verify Hero Card shows "Vote recorded" locked status
    const closeBtn = screen.getByRole('button', { name: /close ballot/i });
    await user.click(closeBtn);

    await waitFor(() => {
      expect(screen.getByText('Vote recorded')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /vote now/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view receipt/i })).toBeInTheDocument();
  });

  it('prompts confirmation modal before logging out', async () => {
    const user = userEvent.setup();
    renderDashboard();

    const logoutBtn = screen.getByRole('button', { name: /log out of voting system/i });
    await user.click(logoutBtn);

    expect(screen.getByText('Log out of iVOTE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, Log Out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stay Logged In' })).toBeInTheDocument();
  });
});
