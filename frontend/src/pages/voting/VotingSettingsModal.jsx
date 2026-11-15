import { useState } from 'react';
import { Modal } from '../../components/shared/Modal';
import { Button } from '../../components/shared/Button';

export function VotingSettingsModal({ isOpen, onClose }) {
  const [emailReceipts, setEmailReceipts] = useState(true);
  const [smsReceipts, setSmsReceipts] = useState(true);
  const [highContrast, setHighContrast] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Voting Preferences & Settings"
      size="sm"
      footer={
        <Button variant="primary" onClick={onClose} fullWidth>
          Save Preferences
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '14px' }}>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <div>
            <div style={{ fontWeight: '600', color: '#0f172a' }}>Email Vote Receipts</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Receive digital proof via registered email</div>
          </div>
          <input
            type="checkbox"
            checked={emailReceipts}
            onChange={(e) => setEmailReceipts(e.target.checked)}
            style={{ width: '18px', height: '18px', accentColor: '#1e3a8a' }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <div>
            <div style={{ fontWeight: '600', color: '#0f172a' }}>SMS Confirmation Alert</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Get instant SMS when your ballot is tallied</div>
          </div>
          <input
            type="checkbox"
            checked={smsReceipts}
            onChange={(e) => setSmsReceipts(e.target.checked)}
            style={{ width: '18px', height: '18px', accentColor: '#1e3a8a' }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
          <div>
            <div style={{ fontWeight: '600', color: '#0f172a' }}>Enhanced High Contrast Mode</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>Maximize contrast for text and interactive states</div>
          </div>
          <input
            type="checkbox"
            checked={highContrast}
            onChange={(e) => setHighContrast(e.target.checked)}
            style={{ width: '18px', height: '18px', accentColor: '#1e3a8a' }}
          />
        </label>
      </div>
    </Modal>
  );
}
