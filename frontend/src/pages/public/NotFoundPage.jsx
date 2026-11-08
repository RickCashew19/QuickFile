import { Link } from 'react-router-dom';
import { Button } from '../../components/shared/Button';
import './NotFoundPage.css';

export function NotFoundPage() {
  return (
    <div className="qf-not-found">
      <span className="qf-not-found__code">404</span>
      <h1 className="qf-not-found__title">Page Not Found</h1>
      <p className="qf-not-found__desc">
        The page you are looking for does not exist or has been moved to another location.
      </p>
      <Link to="/">
        <Button size="lg">Return to Home</Button>
      </Link>
    </div>
  );
}
