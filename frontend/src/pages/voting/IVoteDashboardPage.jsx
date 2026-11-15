import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { Button } from '../../components/shared/Button';
import { Icon } from '../../components/shared/Icon';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog';
import { HeroIllustration } from './HeroIllustration';
import { UserAvatar } from './UserAvatar';
import { VotingFlowModal } from './VotingFlowModal';
import { VotersGuidelineModal } from './VotersGuidelineModal';
import { VotingSettingsModal } from './VotingSettingsModal';
import './VotingPage.css';

export function IVoteDashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  // Navigation & Modal States
  const [activeNav, setActiveNav] = useState('dashboard');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showVotingModal, setShowVotingModal] = useState(false);
  const [showGuidelineModal, setShowGuidelineModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');

  // Calendar Tab State
  const [calendarTab, setCalendarTab] = useState('today');

  // Voting Flow State
  const [hasVoted, setHasVoted] = useState(false);
  const [votedCandidateId, setVotedCandidateId] = useState(null);
  const [voteReceipt, setVoteReceipt] = useState(null);

  // Dynamic Live Results
  const [resultsData, setResultsData] = useState([
    { candidate: 'Candidate #1', percentage: 53, votes: 159, fillClass: 'ivote-chart-fill--1' },
    { candidate: 'Candidate #2', percentage: 38, votes: 114, fillClass: 'ivote-chart-fill--2' },
    { candidate: 'Candidate #3', percentage: 25, votes: 75, fillClass: 'ivote-chart-fill--3' },
  ]);

  // Dynamic Total Votes count
  const [totalVotes, setTotalVotes] = useState(344);

  // Close drawer on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsDrawerOpen(false);
        setShowUserDropdown(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleVoteSuccess = (candidateId, receipt) => {
    setHasVoted(true);
    setVotedCandidateId(candidateId);
    setVoteReceipt(receipt);
    setTotalVotes((prev) => prev + 1);

    // Update candidate vote tally dynamically
    setResultsData((prev) =>
      prev.map((item, idx) => {
        if (
          (candidateId === 'cand-1' && idx === 0) ||
          (candidateId === 'cand-2' && idx === 1) ||
          (candidateId === 'cand-3' && idx === 2)
        ) {
          const newVotes = item.votes + 1;
          const newPercentage = Math.min(100, item.percentage + 1);
          return { ...item, votes: newVotes, percentage: newPercentage };
        }
        return item;
      })
    );

    toast.success(
      'Your official ballot has been cast and cryptographically recorded.',
      'Vote Recorded'
    );
  };

  const handleNavClick = (navKey) => {
    setActiveNav(navKey);
    setIsDrawerOpen(false);

    if (navKey === 'vote') {
      setShowVotingModal(true);
    } else if (navKey === 'guidelines') {
      setShowGuidelineModal(true);
    } else if (navKey === 'settings') {
      setShowSettingsModal(true);
    }
  };

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    if (searchQuery.trim()) {
      toast.info(`Filtering elections and candidates for "${searchQuery}"`, 'Search Filter');
    }
  };

  const handleNotificationClick = () => {
    toast.info('President Student Council election is currently active. Polls close at 5:00 PM.', 'Notification');
  };

  const handleHelpClick = () => {
    setShowGuidelineModal(true);
  };

  const handleConfirmLogout = async () => {
    setShowLogoutConfirm(false);
    if (logout) {
      await logout();
    }
    navigate('/login', { replace: true });
    toast.info('You have safely logged out of your voting account.', 'Logged Out');
  };

  const displayName = user?.full_name || 'Juan Dela Cruz';
  const firstName = displayName.split(' ')[0] || 'Juan';

  return (
    <div className="ivote-shell">
      {/* Mobile Backdrop */}
      {isDrawerOpen && (
        <div
          className="ivote-drawer-backdrop"
          onClick={() => setIsDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* --------------------------------------------------------------------
          1. Left Sidebar (Fixed)
          -------------------------------------------------------------------- */}
      <aside
        className={`ivote-sidebar ${isDrawerOpen ? 'ivote-sidebar--open' : ''}`}
        aria-label="Voting Portal Navigation"
      >
        {/* Brand Logo */}
        <div className="ivote-brand" aria-label="iVOTE">
          <div className="ivote-brand__icon" aria-hidden="true">
            <span>i</span>
          </div>
          <span className="ivote-brand__text" aria-label="iVOTE">
            <span>i</span>VOTE
          </span>
        </div>

        {/* User Profile Card */}
        <div className="ivote-profile-card">
          <div className="ivote-profile-avatar">
            <UserAvatar size={72} />
          </div>
          <div className="ivote-profile-name">{displayName}</div>
          <button
            type="button"
            className="ivote-profile-link"
            onClick={() => setShowSettingsModal(true)}
            aria-label="View user profile"
          >
            <span>View Profile</span>
            <Icon name="chevron-right" size={12} />
          </button>
        </div>

        {/* Primary Navigation */}
        <nav className="ivote-nav" aria-label="Main menu">
          <button
            type="button"
            className={`ivote-nav-item ${activeNav === 'dashboard' ? 'ivote-nav-item--active' : ''}`}
            onClick={() => handleNavClick('dashboard')}
            aria-current={activeNav === 'dashboard' ? 'page' : undefined}
          >
            <Icon name="building" size={18} />
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            className={`ivote-nav-item ${activeNav === 'vote' ? 'ivote-nav-item--active' : ''}`}
            onClick={() => handleNavClick('vote')}
            aria-label="Cast vote"
          >
            <Icon name="vote" size={18} />
            <span>Vote</span>
          </button>

          <button
            type="button"
            className={`ivote-nav-item ${activeNav === 'guidelines' ? 'ivote-nav-item--active' : ''}`}
            onClick={() => handleNavClick('guidelines')}
            aria-label="View voter guidelines"
          >
            <Icon name="guideline" size={18} />
            <span>Voters Guideline</span>
          </button>

          <button
            type="button"
            className={`ivote-nav-item ${activeNav === 'settings' ? 'ivote-nav-item--active' : ''}`}
            onClick={() => handleNavClick('settings')}
            aria-label="Voting system settings"
          >
            <Icon name="settings" size={18} />
            <span>Settings</span>
          </button>
        </nav>

        {/* Logout Action at Bottom with Confirmation */}
        <div className="ivote-sidebar__footer">
          <button
            type="button"
            className="ivote-logout-btn"
            onClick={() => setShowLogoutConfirm(true)}
            aria-label="Log out of voting system"
          >
            <Icon name="logout" size={18} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* --------------------------------------------------------------------
          2. Top Bar & Main Content Wrapper
          -------------------------------------------------------------------- */}
      <div className="ivote-main-wrapper">
        <header className="ivote-topbar">
          <div className="ivote-topbar__left">
            <button
              type="button"
              className="ivote-hamburger"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="Open sidebar menu"
              aria-expanded={isDrawerOpen}
            >
              <Icon name="menu" size={22} />
            </button>

            {/* Pill Search Field with Clear (x) Button */}
            <form onSubmit={handleSearchSubmit} className="ivote-topbar__search" role="search">
              <span className="ivote-search-icon" aria-hidden="true">
                <Icon name="search" size={18} />
              </span>
              <input
                type="text"
                className="ivote-search-input"
                placeholder="Search candidates, positions, guidelines..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="ivote-search-clear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search text"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </form>
          </div>

          <div className="ivote-topbar__right">
            {/* Notification Bell */}
            <button
              type="button"
              className="ivote-icon-btn"
              onClick={handleNotificationClick}
              aria-label="Notifications (1 unread)"
            >
              <Icon name="bell" size={20} />
              <span className="ivote-icon-badge" aria-hidden="true" />
            </button>

            {/* Help Icon */}
            <button
              type="button"
              className="ivote-icon-btn"
              onClick={handleHelpClick}
              aria-label="Help and voter instructions"
            >
              <Icon name="help" size={20} />
            </button>

            {/* User Avatar with Dropdown */}
            <div style={{ position: 'relative' }}>
              <div
                className="ivote-user-chip"
                onClick={() => setShowUserDropdown((prev) => !prev)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setShowUserDropdown((prev) => !prev)}
                aria-expanded={showUserDropdown}
                aria-label={`User menu for ${firstName}`}
              >
                <div className="ivote-user-chip__avatar">
                  <UserAvatar size={34} />
                </div>
                <span className="ivote-user-chip__name">{firstName}</span>
                <Icon name="chevron-down" size={14} />
              </div>

              {showUserDropdown && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    background: '#ffffff',
                    borderRadius: '14px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.12)',
                    padding: '8px',
                    width: '180px',
                    zIndex: 150,
                  }}
                >
                  <button
                    type="button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '8px 12px',
                      border: 'none',
                      background: 'none',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: '#0f172a',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onClick={() => {
                      setShowUserDropdown(false);
                      setShowSettingsModal(true);
                    }}
                  >
                    <Icon name="settings" size={16} />
                    <span>Settings</span>
                  </button>

                  <button
                    type="button"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '8px 12px',
                      border: 'none',
                      background: 'none',
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: '#dc2626',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onClick={() => {
                      setShowUserDropdown(false);
                      setShowLogoutConfirm(true);
                    }}
                  >
                    <Icon name="logout" size={16} />
                    <span>Log out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* --------------------------------------------------------------------
            3. Main Dashboard Content Grid
            -------------------------------------------------------------------- */}
        <main className="ivote-content" id="main-content">
          {/* Greeting Header */}
          <div className="ivote-header">
            <h1 className="ivote-header__title">
              Hello, <span>{firstName}!</span>
            </h1>
            <p className="ivote-header__subtitle">
              Welcome to the Online Voting System. Cast your ballot securely and track live results in real time.
            </p>
          </div>

          <div className="ivote-dashboard-grid">
            {/* Left Column (Hero, Live Results, Election Activities) */}
            <div className="ivote-grid-column">
              {/* Card 1: Wide Hero Card ("Ongoing Elections") */}
              <section className="ivote-card ivote-hero-card" aria-labelledby="ongoing-elections-title">
                <div className="ivote-hero-card__left">
                  <div className="ivote-card__label" id="ongoing-elections-title">
                    Ongoing Elections
                  </div>
                  <h2 className="ivote-hero-card__election-title">
                    President Student Council
                  </h2>

                  {hasVoted ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: '#dcfce7',
                          color: '#15803d',
                          fontWeight: '700',
                          padding: '8px 16px',
                          borderRadius: '20px',
                          fontSize: '13px',
                          border: '1px solid #bbf7d0',
                        }}
                      >
                        <Icon name="check-circle" size={18} />
                        Vote recorded
                      </span>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowVotingModal(true)}
                        aria-label="View Receipt"
                      >
                        View Receipt
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <Button
                        variant="primary"
                        size="md"
                        onClick={() => setShowVotingModal(true)}
                        aria-label="Vote now for President Student Council"
                      >
                        Vote now
                      </Button>
                    </div>
                  )}
                </div>

                {/* Friendly Illustration on Right */}
                <div className="ivote-hero-card__illustration" aria-hidden="true">
                  <HeroIllustration />
                </div>
              </section>

              {/* Card 3: Live Results Card */}
              <section className="ivote-card" aria-labelledby="live-results-title">
                <div className="ivote-results-header">
                  <h2 className="ivote-card__title" id="live-results-title" style={{ margin: 0 }}>
                    Live Results
                  </h2>

                  <div className="ivote-results-selector" aria-label="Election selector">
                    <button
                      type="button"
                      className="ivote-pager-arrow"
                      aria-label="Previous election results"
                    >
                      <Icon name="chevron-left" size={14} />
                    </button>
                    <span>President Student Council</span>
                    <button
                      type="button"
                      className="ivote-pager-arrow"
                      aria-label="Next election results"
                    >
                      <Icon name="chevron-right" size={14} />
                    </button>
                  </div>
                </div>

                <div className="ivote-chart-bars" role="region" aria-label="Candidate vote comparison bar chart">
                  {resultsData.map((res) => (
                    <div key={res.candidate} className="ivote-chart-row">
                      <span className="ivote-chart-candidate">{res.candidate}</span>
                      <div className="ivote-chart-track">
                        <div
                          className={`ivote-chart-fill ${res.fillClass}`}
                          style={{ width: `${Math.min(100, (res.votes / 150) * 100)}%` }}
                        >
                          <span>{res.percentage}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Chart Axis Numbers */}
                <div className="ivote-chart-axis" aria-hidden="true">
                  <span>0</span>
                  <span>30</span>
                  <span>60</span>
                  <span>90</span>
                  <span>120</span>
                  <span>150</span>
                </div>
                <div className="ivote-chart-axis-label" aria-hidden="true">
                  No. of votes
                </div>

                <div className="ivote-chart-note">
                  *The candidate list is not in order
                </div>
              </section>

              {/* Card 5: Election Activities Card */}
              <section className="ivote-card" aria-labelledby="election-activities-title">
                <div className="ivote-activities-header">
                  <h2 className="ivote-card__title" id="election-activities-title" style={{ margin: 0 }}>
                    Election Activities
                  </h2>

                  <div className="ivote-status-legend" aria-label="Status legend">
                    <span className="ivote-legend-dot">
                      <span className="ivote-dot ivote-dot--ongoing" />
                      Ongoing
                    </span>
                    <span className="ivote-legend-dot">
                      <span className="ivote-dot ivote-dot--pending" />
                      Pending
                    </span>
                    <span className="ivote-legend-dot">
                      <span className="ivote-dot ivote-dot--concluded" />
                      Concluded
                    </span>
                  </div>
                </div>

                <div className="ivote-activity-table">
                  <div className="ivote-activity-row">
                    <span className="ivote-activity-name">President Student Council</span>
                    <div className="ivote-activity-meta">
                      <span className="ivote-dot ivote-dot--ongoing" aria-hidden="true" />
                      <span>12/22/2022</span>
                    </div>
                  </div>

                  <div className="ivote-activity-row">
                    <span className="ivote-activity-name">Vice President Student Council</span>
                    <div className="ivote-activity-meta">
                      <span className="ivote-dot ivote-dot--pending" aria-hidden="true" />
                      <span>Pending</span>
                    </div>
                  </div>

                  <div className="ivote-activity-row">
                    <span className="ivote-activity-name">Secretary Student Council</span>
                    <div className="ivote-activity-meta">
                      <span className="ivote-dot ivote-dot--concluded" aria-hidden="true" />
                      <span>Concluded</span>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column (Calendar & Voting Process) */}
            <div className="ivote-grid-column">
              {/* Card 2: Calendar Card (Top Right) */}
              <section className="ivote-card ivote-calendar-card" aria-labelledby="calendar-card-title">
                <h2 className="ivote-card__title" id="calendar-card-title">
                  Calendar
                </h2>

                <div className="ivote-calendar-tabs" role="tablist" aria-label="Calendar Range">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={calendarTab === 'today'}
                    className={`ivote-cal-tab ${calendarTab === 'today' ? 'ivote-cal-tab--active' : ''}`}
                    onClick={() => setCalendarTab('today')}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={calendarTab === 'next-week'}
                    className={`ivote-cal-tab ${calendarTab === 'next-week' ? 'ivote-cal-tab--active' : ''}`}
                    onClick={() => setCalendarTab('next-week')}
                  >
                    Next week
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={calendarTab === 'this-month'}
                    className={`ivote-cal-tab ${calendarTab === 'this-month' ? 'ivote-cal-tab--active' : ''}`}
                    onClick={() => setCalendarTab('this-month')}
                  >
                    This Month
                  </button>
                </div>

                <div className="ivote-timeline-row" aria-hidden="true">
                  <span>7:00</span>
                  <span>8:00</span>
                  <span>9:00</span>
                  <span>10:00</span>
                  <span>11:00</span>
                </div>

                <div className="ivote-cal-event-badge">
                  <div className="ivote-cal-date-pill">
                    <div className="ivote-cal-date-month">Dec</div>
                    <div className="ivote-cal-date-day">22</div>
                  </div>

                  <span className="ivote-cal-event-title">
                    President Student Council
                  </span>
                </div>
              </section>

              {/* Card 4: Voting Process Card */}
              <section className="ivote-card ivote-process-card" aria-labelledby="voting-process-title">
                <h2 className="ivote-card__title" id="voting-process-title">
                  Voting Process
                </h2>

                <div className="ivote-stat-item">
                  <div className="ivote-circle-badge">
                    362
                  </div>
                  <div className="ivote-stat-label">
                    Total number of registered voters
                  </div>
                </div>

                <div className="ivote-stat-item">
                  <div className="ivote-circle-badge ivote-circle-badge--accent">
                    {totalVotes}
                  </div>
                  <div className="ivote-stat-label">
                    Total number of votes
                  </div>
                </div>

                <div className="ivote-stat-item">
                  <div className="ivote-circle-badge ivote-circle-badge--muted">
                    3
                  </div>
                  <div className="ivote-stat-label">
                    Total number of registered candidates
                  </div>
                </div>
              </section>
            </div>
          </div>
        </main>
      </div>

      {/* --------------------------------------------------------------------
          Interactive Modals
          -------------------------------------------------------------------- */}
      {/* 1. Official Ballot Voting Flow Modal */}
      <VotingFlowModal
        isOpen={showVotingModal}
        onClose={() => setShowVotingModal(false)}
        hasVoted={hasVoted}
        votedCandidateId={votedCandidateId}
        voteReceipt={voteReceipt}
        onVoteSuccess={handleVoteSuccess}
      />

      {/* 2. Voters Guideline Modal */}
      <VotersGuidelineModal
        isOpen={showGuidelineModal}
        onClose={() => setShowGuidelineModal(false)}
      />

      {/* 3. Settings Modal */}
      <VotingSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />

      {/* 4. Logout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleConfirmLogout}
        title="Log out of iVOTE"
        message="Are you sure you want to log out of your online voting session? Make sure your ballot has been submitted before leaving."
        confirmText="Yes, Log Out"
        cancelText="Stay Logged In"
      />
    </div>
  );
}
