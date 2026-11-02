import { Outlet, useOutletContext } from 'react-router';
import type { RouteHandle } from './router-context';

export const handle: RouteHandle = { destination: 'Workspace' };

export default function WorkspaceScopeLayout() {
  const context = useOutletContext();
  return <Outlet context={context} />;
}
