import { Navigate, useLocation } from 'react-router';
import { workspacePath } from './api';

export default function NewKeyRoute() {
  const location = useLocation();
  return <Navigate to={`${workspacePath(location.pathname)}/keys`} replace state={{ createKey: true }} />;
}
