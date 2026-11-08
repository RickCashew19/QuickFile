export function ProfileCompletenessBar({ score = 0 }) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));

  let colorClass = 'qf-completeness-bar__fill--low';
  if (safeScore >= 80) {
    colorClass = 'qf-completeness-bar__fill--high';
  } else if (safeScore >= 50) {
    colorClass = 'qf-completeness-bar__fill--medium';
  }

  return (
    <div className="qf-completeness-card">
      <div className="qf-completeness-header">
        <div>
          <span className="qf-completeness-title">Profile Completeness</span>
          <p className="qf-completeness-subtitle">
            A complete profile expedites your barangay document verification and issuance.
          </p>
        </div>
        <span className="qf-completeness-percentage">{safeScore}%</span>
      </div>

      <div
        className="qf-completeness-bar"
        role="progressbar"
        aria-valuenow={safeScore}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Profile completeness progress"
      >
        <div
          className={`qf-completeness-bar__fill ${colorClass}`}
          style={{ width: `${safeScore}%` }}
        />
      </div>
    </div>
  );
}
