import { useState, useEffect } from 'react';
import { staffService } from '../../../services/staffService';
import { Input } from '../../../components/shared/Input';
import { Loader } from '../../../components/shared/Loader';

export function ResidentSearchInput({ selectedResident, onSelectResident, error, disabled = false }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setSearchError(null);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const residents = await staffService.searchResidents(trimmed);
        setResults(residents || []);
      } catch (err) {
        setSearchError(err.message || 'Error searching residents.');
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

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
          }}
          disabled={disabled}
        >
          Change Resident
        </button>
      </div>
    );
  }

  return (
    <div className="qf-resident-search-container">
      <Input
        label="Search Resident Citizen (Min 3 characters) *"
        name="residentSearch"
        value={query}
        placeholder="Type name, email, or mobile number..."
        onChange={(e) => setQuery(e.target.value)}
        error={error || searchError}
        disabled={disabled}
        required
      />

      {searching && (
        <div style={{ marginTop: 'var(--space-2)' }}>
          <Loader size="sm" text="Searching resident records..." />
        </div>
      )}

      {results.length > 0 && !searching && (
        <ul className="qf-resident-search-results" role="listbox">
          {results.map((res) => (
            <li
              key={res._id}
              className="qf-resident-result-item"
              role="option"
              aria-selected={false}
              onClick={() => onSelectResident(res)}
            >
              <span className="qf-resident-name">{res.full_name}</span>
              <span className="qf-resident-meta">
                {res.email} {res.phone ? `(${res.phone})` : ''}
              </span>
            </li>
          ))}
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
