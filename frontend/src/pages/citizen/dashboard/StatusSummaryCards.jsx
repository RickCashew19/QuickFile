import { Icon } from '../../../components/shared/Icon';

export function StatusSummaryCards({ counts = {} }) {
  const cards = [
    {
      key: 'pending',
      label: 'Pending Review',
      count: counts.pending || 0,
      icon: 'calendar',
      color: 'var(--status-pending-color)',
      bg: 'var(--status-pending-bg)',
    },
    {
      key: 'under_review',
      label: 'Under Review',
      count: (counts.under_review || 0) + (counts.approved || 0) + (counts.in_preparation || 0),
      icon: 'refresh',
      color: 'var(--status-under_review-color)',
      bg: 'var(--status-under_review-bg)',
    },
    {
      key: 'ready_for_pickup',
      label: 'Ready for Pickup',
      count: counts.ready_for_pickup || 0,
      icon: 'check',
      color: 'var(--status-ready_for_pickup-color)',
      bg: 'var(--status-ready_for_pickup-bg)',
    },
    {
      key: 'released',
      label: 'Released & Completed',
      count: counts.released || 0,
      icon: 'shield',
      color: 'var(--status-released-color)',
      bg: 'var(--status-released-bg)',
    },
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 'var(--space-4)',
        marginBottom: 'var(--space-8)',
      }}
    >
      {cards.map((c) => (
        <div
          key={c.key}
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4) var(--space-5)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-4)',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              backgroundColor: c.bg,
              color: c.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={c.icon} size={22} />
          </div>
          <div>
            <span style={{ fontSize: 'var(--font-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text)', display: 'block', lineHeight: 1.1 }}>
              {c.count}
            </span>
            <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-secondary)' }}>
              {c.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
