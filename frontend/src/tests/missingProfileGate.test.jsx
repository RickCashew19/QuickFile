import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MissingProfileInfoModal } from '../components/shared/MissingProfileInfoModal';

describe('MissingProfileInfoModal', () => {
  it('lists the missing fields and offers update / later actions for citizens', () => {
    const onUpdateProfile = vi.fn();
    const onClose = vi.fn();
    render(
      <MissingProfileInfoModal
        isOpen
        missingFields={[{ key: 'birthdate', label: 'Age' }, { key: 'street_address', label: 'Address' }]}
        onUpdateProfile={onUpdateProfile}
        onClose={onClose}
      />
    );

    expect(screen.getByText('Age')).toBeTruthy();
    expect(screen.getByText('Address')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Update my information/i }));
    expect(onUpdateProfile).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /^Later$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is informational only in staff (walk-in) variant', () => {
    const onClose = vi.fn();
    render(
      <MissingProfileInfoModal
        isOpen
        missingFields={[{ key: 'purok_zone', label: 'Purok / Zone' }]}
        variant="staff"
        onClose={onClose}
      />
    );

    expect(screen.getByText('Resident profile is incomplete')).toBeTruthy();
    expect(screen.getByText('Purok / Zone')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Update my information/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Close$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    render(<MissingProfileInfoModal isOpen={false} missingFields={[]} onClose={() => {}} />);
    expect(screen.queryByText(/missing information/i)).toBeNull();
  });
});
