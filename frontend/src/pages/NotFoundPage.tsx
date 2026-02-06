import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button.tsx';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <h1 className="text-6xl font-bold text-gray-900">404</h1>
      <p className="mt-4 text-xl text-gray-600">Page not found</p>
      <p className="mt-2 text-gray-500">
        The page you are looking for does not exist.
      </p>
      <Link to="/" className="mt-6">
        <Button>Back to Dashboard</Button>
      </Link>
    </div>
  );
}
