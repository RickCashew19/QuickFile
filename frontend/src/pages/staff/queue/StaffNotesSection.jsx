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
        <form onSubmit={handleSubmit} className="qf-staff-note-form">
          <div className="qf-input-group">
            <label htmlFor="staff-new-note" className="qf-sr-only">
              Add processing note
            </label>
            <textarea
              id="staff-new-note"
              className="qf-input"
              rows={2}
              value={newNote}
              onChange={(e) => {
                setNewNote(e.target.value);
                if (error) setError('');
              }}
              placeholder="Add an internal note or update about this application..."
              disabled={loading}
              maxLength={500}
            />
            {error && <span className="qf-input-error">{error}</span>}
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
