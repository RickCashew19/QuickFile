import { Modal } from '../../components/shared/Modal';
import { Button } from '../../components/shared/Button';
import { Icon } from '../../components/shared/Icon';

export function VotersGuidelineModal({ isOpen, onClose }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Voter Guidelines & Instructions"
      size="md"
      footer={
        <Button variant="primary" onClick={onClose} fullWidth>
          Understood & Close
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '14px', color: '#475569' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#e0edff', color: '#1e3a8a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: '700' }}>
            1
          </div>
          <div>
            <strong style={{ color: '#0f172a' }}>Voter Eligibility</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
              All officially enrolled students with an active student ID are eligible to cast one vote per student council position.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#e0edff', color: '#1e3a8a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: '700' }}>
            2
          </div>
          <div>
            <strong style={{ color: '#0f172a' }}>Ballot Confidentiality & Encryption</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
              Your vote is completely secret and cryptographically detached from your personal student profile. No faculty, administrator, or candidate can view who you voted for.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#e0edff', color: '#1e3a8a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: '700' }}>
            3
          </div>
          <div>
            <strong style={{ color: '#0f172a' }}>Two-Step Confirmation</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
              After selecting your preferred candidate, you will be prompted to explicitly confirm your choice. Once cast, a digital receipt with a timestamp is issued.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#e0edff', color: '#1e3a8a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: '700' }}>
            4
          </div>
          <div>
            <strong style={{ color: '#0f172a' }}>Voting Period Deadlines</strong>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
              Voting closes at 5:00 PM on Election Day (December 22). No ballots can be accepted or modified after the poll closes.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
