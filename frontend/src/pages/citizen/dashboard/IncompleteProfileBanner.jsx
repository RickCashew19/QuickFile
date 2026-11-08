import { Link } from 'react-router-dom';
import { Icon } from '../../../components/shared/Icon';
import { Button } from '../../../components/shared/Button';

export function IncompleteProfileBanner({ completenessScore = 0 }) {
  return (
    <div
      role="region"
      aria-label="Profile Completion Notice"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 'var(--space-3)',
        padding: 'var(--space-4) var(--space-6)',
        backgroundColor: 'var(--color-warning-bg)',
        border: '1px solid var(--color-warning-border)',
        borderRadius: 'var(--radius-lg)',
        marginBottom: 'var(--space-6)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={{ color: 'var(--color-warning)', display: 'flex' }}>
          <Icon name="alert" size={24} />
        </span>
        <div>
          <h2 style={{ fontSize: 'var(--font-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-warning)' }}>
            Complete Your Resident Profile ({completenessScore}%)
          </h2>
          <p style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)', margin: 0 }}>
            Providing your birthdate, gender, and residency address ensures rapid verification of your document requests.
          </p>
        </div>
      </div>

      <Link to="/citizen/profile">
        <Button size="sm" variant="outline">
          Complete Profile
        </Button>
      </Link>
    </div>
  );
}
