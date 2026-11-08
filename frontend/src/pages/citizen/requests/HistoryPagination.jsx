import { Button } from '../../../components/shared/Button';
import { Icon } from '../../../components/shared/Icon';

export function HistoryPagination({ pagination, onPageChange, onLimitChange }) {
  const { page = 1, limit = 10, total = 0, total_pages = 1 } = pagination || {};

  if (total === 0) return null;

  const startItem = (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, total);

  return (
    <div className="qf-history-pagination">
      <div className="qf-history-pagination__info">
        Showing <strong>{startItem}</strong>-<strong>{endItem}</strong> of <strong>{total}</strong> requests
      </div>

      <div className="qf-history-pagination__controls">
        <label className="qf-history-pagination__limit-label">
          <span>Rows:</span>
          <select
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="qf-history-pagination__select"
            aria-label="Items per page"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>

        <div className="qf-history-pagination__nav">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="Previous page"
            iconLeft={<Icon name="arrowLeft" size={14} />}
          >
            Prev
          </Button>

          <span className="qf-history-pagination__page-indicator">
            Page {page} of {total_pages}
          </span>

          <Button
            variant="secondary"
            size="sm"
            disabled={page >= total_pages}
            onClick={() => onPageChange(page + 1)}
            aria-label="Next page"
            iconRight={<Icon name="arrowRight" size={14} />}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
