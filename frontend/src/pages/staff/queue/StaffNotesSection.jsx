import { useState } from 'react';
import { Button } from '../../../components/shared/Button';
import { Icon } from '../../../components/shared/Icon';

export function StaffNotesSection({
  notes = '',
  canAddNote = false,
  onAddNote,
  loading = false,
}) {
  const [newNote, setNewNote] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = newNote.trim();
    if (!trimmed) return;
    if (trimmed.length > 500) {
      setError('Note cannot exceed 500 characters.');
      return;
    }
    setError('');
    const success = await onAddNote(trimmed);
    if (success) {
      setNewNote('');
    }
  };

  return (
    <div className="qf-staff-notes-card">
      <div className="qf-staff-notes-card__header">
        <h3 className="qf-staff-card-title">
          <Icon name="file" size={18} /> Internal Staff Processing Notes
        </h3>
        <span className="qf-staff-notes-hint">Staff-only &bull; Never visible to citizen</span>
      </div>

      <div className="qf-staff-notes-history">
        {notes ? (
          <pre className="qf-staff-notes-content">{notes}</pre>
        ) : (
          <p className="qf-staff-notes-empty">No internal notes recorded yet.</p>
        )}
      </div>

      {canAddNote && (
        <form onSubmit={handleSubmit} className="qf-staff-note-form" style={{ marginTop: 'var(--space-2)' }}>
          <div className="qf-field" style={{ marginBottom: 'var(--space-1)' }}>
            <label htmlFor="staff-new-note" className="qf-field__label" style={{ fontSize: 'var(--font-xs)', marginBottom: '4px' }}>
              Add Internal Processing Note
            </label>
            <textarea
              id="staff-new-note"
              className="qf-field__input"
              rows={3}
              value={newNote}
              onChange={(e) => {
                setNewNote(e.target.value);
                if (error) setError('');
              }}
              placeholder="Write internal staff notes or remarks here..."
              disabled={loading}
              maxLength={500}
              style={{
                fontFamily: 'inherit',
                fontSize: 'var(--font-xs)',
                lineHeight: 1.5,
                resize: 'vertical',
                minHeight: '64px',
              }}
            />
            {error && (
              <span style={{ color: 'var(--color-danger)', fontSize: 'var(--font-xs)', marginTop: '4px', display: 'block' }}>
                {error}
              </span>
            )}
          </div>
          <div className="qf-staff-note-form__footer">
            <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-text-muted)' }}>
              {newNote.length}/500
            </span>
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              loading={loading}
              disabled={!newNote.trim() || loading}
            >
              Append Note
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
