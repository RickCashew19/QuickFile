import { formatCurrency } from '../../../utils/formatters';

export function StaffReportSummaryCards({ summary = {} }) {
  const cards = [
    {
      title: 'Total Requests',
      value: summary.total_requests || 0,
      variant: 'primary',
      hint: 'Applications in period',
    },
    {
      title: 'Released Documents',
      value: summary.released_count || 0,
      variant: 'success',
      hint: 'Successfully claimed',
    },
    {
      title: 'Rejected Requests',
      value: summary.rejected_count || 0,
      variant: 'danger',
      hint: 'Disapproved / invalid',
    },
    {
      title: 'Collected Revenue',
      value: formatCurrency(summary.total_revenue || 0),
      variant: 'info',
      hint: 'Gross document fees',
    },
    {
      title: 'Waived Requests',
      value: `${summary.waived_count || 0} (${formatCurrency(summary.waived_amount || 0)})`,
      variant: 'warning',
      hint: 'Exempted statutory fees',
    },
  ];

  return (
    <div className="qf-report-summary-grid">
      {cards.map((card) => (
        <div key={card.title} className={`qf-report-card qf-report-card--${card.variant}`}>
          <span className="qf-report-card__title">{card.title}</span>
          <div className="qf-report-card__value">{card.value}</div>
          <span className="qf-report-card__hint">{card.hint}</span>
        </div>
      ))}
    </div>
  );
}
