import { Icon } from './Icon';
import './Pagination.css';

export function Pagination({
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  disabled = false,
  className = '',
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      className={`qf-pagination ${className}`.trim()}
      aria-label="Pagination Navigation"
    >
      <button
        type="button"
        className="qf-pagination__btn"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={disabled || currentPage <= 1}
        aria-label="Go to previous page"
      >
        <Icon name="chevron-left" size={16} />
      </button>

      <span className="qf-pagination__info">
        Page {currentPage} of {totalPages}
      </span>

      <button
        type="button"
        className="qf-pagination__btn"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={disabled || currentPage >= totalPages}
        aria-label="Go to next page"
      >
        <Icon name="chevron-right" size={16} />
      </button>
    </nav>
  );
}
