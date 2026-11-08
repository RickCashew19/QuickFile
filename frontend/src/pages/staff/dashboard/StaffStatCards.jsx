import { Icon } from '../../../components/shared/Icon';

export function StaffStatCards({ stats = {}, liveCounts = null }) {
  // Prefer live polling counts if available, falling back to initial dashboard summary
  const pendingCount = liveCounts?.pending ?? stats?.pending ?? stats?.pending_requests ?? 0;
  const underReviewCount = liveCounts?.under_review ?? stats?.under_review ?? 0;
  const inPreparationCount = liveCounts?.in_preparation ?? stats?.in_preparation ?? 0;
  const readyCount = liveCounts?.ready_for_pickup ?? stats?.ready_for_pickup ?? 0;

  const cards = [
    {
      title: 'Pending Review',
      count: pendingCount,
      variant: 'warning',
      icon: 'clock',
      hint: 'Awaiting initial check',
    },
    {
      title: 'Under Review',
      count: underReviewCount,
      variant: 'info',
      icon: 'search',
      hint: 'In verification stage',
    },
    {
      title: 'In Preparation',
      count: inPreparationCount,
      variant: 'primary',
      icon: 'file',
      hint: 'Ready for encoding & issuance',
    },
    {
      title: 'Ready for Pickup',
      count: readyCount,
      variant: 'success',
      icon: 'check',
      hint: 'Awaiting resident claim',
    },
  ];

  return (
    <div className="qf-staff-stats-grid">
      {cards.map((card) => (
        <div key={card.title} className={`qf-staff-stat-card qf-staff-stat-card--${card.variant}`}>
          <div className="qf-staff-stat-card__header">
            <span className="qf-staff-stat-card__title">{card.title}</span>
            <span className="qf-staff-stat-card__icon">
              <Icon name={card.icon} size={20} />
            </span>
          </div>
          <div className="qf-staff-stat-card__value">{card.count}</div>
          <div className="qf-staff-stat-card__hint">{card.hint}</div>
        </div>
      ))}
    </div>
  );
}
