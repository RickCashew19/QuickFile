import React from 'react';
import { Button } from './Button';
import { Icon } from './Icon';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[QuickFile ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: 'var(--space-6)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-danger-light, #fee2e2)',
              color: 'var(--color-danger, #ef4444)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 'var(--space-4)',
            }}
          >
            <Icon name="alert" size={32} />
          </div>
          <h2
            style={{
              fontSize: 'var(--font-xl)',
              fontWeight: 'var(--font-bold)',
              marginBottom: 'var(--space-2)',
              color: 'var(--color-text)',
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              fontSize: 'var(--font-sm)',
              color: 'var(--color-text-secondary)',
              maxWidth: 480,
              marginBottom: 'var(--space-6)',
            }}
          >
            An unexpected error occurred while rendering this view. Please try reloading the page.
          </p>
          <Button variant="primary" onClick={this.handleReset}>
            Reload Page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
