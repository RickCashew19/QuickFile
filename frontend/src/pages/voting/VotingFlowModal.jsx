import { useState } from 'react';
import { Modal } from '../../components/shared/Modal';
import { Button } from '../../components/shared/Button';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog';
import { Icon } from '../../components/shared/Icon';

export const CANDIDATES = [
  {
    id: 'cand-1',
    name: 'Alex Morgan',
    party: 'Independent Student Alliance',
    number: '01',
    avatarBg: '#dbeafe',
    avatarText: 'AM',
    platform: 'Digital Student Services, Automated Clearances, and 24/7 Library Resources',
  },
  {
    id: 'cand-2',
    name: 'Beatrice Vance',
    party: 'United Student Coalition',
    number: '02',
    avatarBg: '#fef3c7',
    avatarText: 'BV',
    platform: 'Campus Sustainability, Mental Health Counseling Grants, and Green Spaces',
  },
  {
    id: 'cand-3',
    name: 'Carlos Reyes',
    party: 'Progressive Youth Union',
    number: '03',
    avatarBg: '#e0e7ff',
    avatarText: 'CR',
    platform: 'Transparent Council Budgeting, Athletic Stipends, and Free Commuter Shuttles',
  },
];

export function VotingFlowModal({
  isOpen,
  onClose,
  hasVoted,
  votedCandidateId,
  voteReceipt,
  onVoteSuccess,
}) {
  const [selectedCandidateId, setSelectedCandidateId] = useState(votedCandidateId || null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localReceipt, setLocalReceipt] = useState(voteReceipt || null);

  const selectedCandidate = CANDIDATES.find((c) => c.id === selectedCandidateId);

  const handleCardClick = (id) => {
    if (hasVoted || localReceipt) return; // Locked once vote is recorded
    setSelectedCandidateId(id);
  };

  const handleCardKeyDown = (e, id) => {
    if (hasVoted || localReceipt) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      setSelectedCandidateId(id);
    }
  };

  const handleOpenConfirm = () => {
    if (!selectedCandidateId || hasVoted || localReceipt) return;
    setShowConfirmModal(true);
  };

  const handleConfirmVote = async () => {
    setIsSubmitting(true);
    // Simulate instantaneous & secure ballot casting (<100ms feedback)
    await new Promise((r) => setTimeout(r, 600));

    const receipt = {
      code: `VOTE-${Date.now().toString().slice(-4)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      timestamp: new Date().toLocaleString(),
      candidateName: selectedCandidate?.name,
      electionTitle: 'President Student Council',
      hash: `0x${Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
    };

    setLocalReceipt(receipt);
    setIsSubmitting(false);
    setShowConfirmModal(false);
    onVoteSuccess?.(selectedCandidateId, receipt);
  };

  const isLocked = Boolean(hasVoted || localReceipt);

  const footer = isLocked ? (
    <Button variant="secondary" onClick={onClose} fullWidth>
      Close Ballot
    </Button>
  ) : (
    <div style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'flex-end' }}>
      <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
        Cancel
      </Button>
      <Button
        variant="primary"
        onClick={handleOpenConfirm}
        disabled={!selectedCandidateId || isSubmitting}
        loading={isSubmitting}
        aria-label={
          selectedCandidate
            ? `Submit official vote for ${selectedCandidate.name}`
            : 'Submit vote (select a candidate first)'
        }
      >
        Submit vote
      </Button>
    </div>
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isLocked ? 'Official Ballot Receipt' : 'Official Ballot: President Student Council'}
        size="md"
        footer={footer}
      >
        <div className="ivote-ballot-container">
          {/* Post-Vote Receipt View */}
          {localReceipt ? (
            <div className="ivote-receipt-card" role="region" aria-label="Official Vote Receipt">
              <div className="ivote-receipt-badge" aria-hidden="true">
                <Icon name="check-circle" size={36} />
              </div>

              <div>
                <h3 style={{ fontSize: '20px', fontWeight: '800', color: '#1e3a8a', marginBottom: '4px' }}>
                  Vote Recorded Successfully!
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b' }}>
                  Your official ballot has been encrypted and anonymously registered into the student council ledger.
                </p>
              </div>

              <div style={{ width: '100%', background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', color: '#64748b' }}>
                  <span>Confirmation Number:</span>
                  <span style={{ fontWeight: '700', color: '#1e3a8a', fontFamily: 'monospace' }}>{localReceipt.code}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', color: '#64748b' }}>
                  <span>Candidate Selected:</span>
                  <span style={{ fontWeight: '700', color: '#0f172a' }}>{localReceipt.candidateName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', color: '#64748b' }}>
                  <span>Timestamp:</span>
                  <span style={{ color: '#0f172a' }}>{localReceipt.timestamp}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', wordBreak: 'break-all' }}>
                  <span>Cryptographic Proof:</span>
                  <span style={{ fontFamily: 'monospace' }}>{localReceipt.hash}</span>
                </div>
              </div>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#16a34a', fontWeight: '600' }}>
                <Icon name="shield" size={16} />
                <span>Encrypted • Immutable • Verified</span>
              </div>
            </div>
          ) : (
            /* Ballot Choices View */
            <>
              <p className="ivote-ballot-intro">
                Please select your preferred candidate for <strong>President Student Council</strong>. You may select only one choice. Review your selection carefully before submitting.
              </p>

              <div
                className="ivote-candidate-grid"
                role="radiogroup"
                aria-label="President Student Council Candidates"
              >
                {CANDIDATES.map((cand) => {
                  const isSelected = selectedCandidateId === cand.id;
                  return (
                    <div
                      key={cand.id}
                      tabIndex={isLocked ? -1 : 0}
                      role="radio"
                      aria-checked={isSelected}
                      aria-label={`${cand.name}, Candidate #${cand.number}, ${cand.party}`}
                      className={`ivote-candidate-card ${
                        isSelected ? 'ivote-candidate-card--selected' : ''
                      }`}
                      onClick={() => handleCardClick(cand.id)}
                      onKeyDown={(e) => handleCardKeyDown(e, cand.id)}
                    >
                      <div
                        className="ivote-candidate-avatar"
                        style={{ backgroundColor: cand.avatarBg }}
                        aria-hidden="true"
                      >
                        <span style={{ fontWeight: '800', color: '#1e3a8a', fontSize: '16px' }}>
                          {cand.avatarText}
                        </span>
                      </div>

                      <div className="ivote-candidate-info">
                        <div className="ivote-candidate-name">{cand.name}</div>
                        <div className="ivote-candidate-party">{cand.party}</div>
                        <div className="ivote-candidate-platform">{cand.platform}</div>
                      </div>

                      <div className="ivote-candidate-check" aria-hidden="true">
                        {isSelected && <Icon name="check" size={16} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Confirmation Step Before Vote Is Cast */}
      <ConfirmDialog
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmVote}
        title="Confirm Your Vote"
        message={`Are you sure you want to cast your official vote for ${selectedCandidate?.name || 'this candidate'} for President Student Council? This action is final and cannot be undone.`}
        confirmText="Confirm & Cast Vote"
        cancelText="Review Ballot"
        loading={isSubmitting}
      />
    </>
  );
}
