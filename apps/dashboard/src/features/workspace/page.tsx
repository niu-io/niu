import { useDashboardContext } from '@/app/dashboard-context';
import WorkspaceDirectory from './WorkspaceDirectory';

export default function WorkspacesPage() {
  return <WorkspaceDirectory context={useDashboardContext()} />;
}
