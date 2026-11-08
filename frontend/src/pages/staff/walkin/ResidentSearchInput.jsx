import { useState, useEffect } from 'react';
import { staffService } from '../../../services/staffService';
import { Input } from '../../../components/shared/Input';
import { Loader } from '../../../components/shared/Loader';

export function ResidentSearchInput({ selectedResident, onSelectResident, error, disabled = false }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setActiveIndex(-1);
      setSearchError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const residents = await staffService.searchResidents(trimmed);
        setResults(residents || []);
        setActiveIndex(-1);
      } catch (err) {
        setSearchError(err.message || 'Error searching residents.');
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  const handleKeyDown = (e) => {
    if (results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && results[activeIndex]) {
        e.preventDefault();
        onSelectResident(results[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setResults([]);
      setActiveIndex(-1);
    }
  };

  if (selectedResident) {
    return (
      <div className="qf-selected-resident-chip">
        <div className="qf-selected-resident-info">
          <span className="qf-selected-resident-name">{selectedResident.full_name}</span>
          <span className="qf-selected-resident-meta">
            {selectedResident.email} &bull; {selectedResident.phone || 'No phone'}
          </span>
        </div>
        <button
          type="button"
          className="qf-btn qf-btn--ghost qf-btn--sm"
          onClick={() => {
            onSelectResident(null);
            setQuery('');
            setActiveIndex(-1);
          }}
          disabled={disabled}
        >
          Change Resident
        </button>
      </div>
    );
  }

  return (
    <div className="qf-resident-search-container" onKeyDown={handleKeyDown}>
      <Input
        label="Search Resident Citizen (Min 3 characters) *"
        name="residentSearch"
        value={query}
        placeholder="Type name, email, or mobile number..."
        onChange={(e) => setQuery(e.target.value)}
        error={error || searchError}
        disabled={disabled}
        required
        aria-autocomplete="list"
        aria-controls="resident-listbox"
        aria-activedescendant={activeIndex >= 0 ? `resident-option-${activeIndex}` : undefined}
      />

      {searching && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <Loader size="sm" text="Searching resident records..." />
        </div>
      )}

      {results.length > 0 && !searching && (
        <ul
          id="resident-listbox"
          className="qf-resident-search-results"
          role="listbox"
          aria-label="Matching residents"
        >
          {results.map((res, idx) => {
            const isActive = idx === activeIndex;
            return (
              <li
                key={res._id}
                id={`resident-option-${idx}`}
                className={`qf-resident-result-item ${isActive ? 'qf-resident-result-item--active' : ''}`}
                role="option"
                aria-selected={isActive}
                style={isActive ? { backgroundColor: 'var(--color-primary-subtle, #e0f2fe)' } : undefined}
                onClick={() => onSelectResident(res)}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <span className="qf-resident-name">{res.full_name}</span>
                <span className="qf-resident-meta">
                  {res.email} {res.phone ? `(${res.phone})` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {query.trim().length >= 3 && results.length === 0 && !searching && !searchError && (
        <p className="qf-resident-not-found">
          No matching resident found. The citizen must have a registered account in QuickFile.
        </p>
      )}
    </div>
  );
}
