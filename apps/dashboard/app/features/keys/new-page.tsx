import { Navigate, useLocation } from 'react-router';
import type { RouteHandle } from '@/shell/router-context';
import { workspacePath } from './api';

export const handle: RouteHandle = {
  destination: 'Workspace',
  navTo: 'keys',
  title: { en: 'New key', zh: '新建密钥' },
};

const CREATE_KEY_REDIRECT_STATE = { createKey: true } as const;

export default function NewKeyRoute() {
  const location = useLocation();
  return <Navigate to={`${workspacePath(location.pathname)}/keys`} replace state={CREATE_KEY_REDIRECT_STATE} />;
}
