import { useDashboardContext } from '@/app/dashboard-context';
import { workspaceDisplayName } from '@/app/workspace-route';
import VolcengineView from './VolcengineView';
export default function VolcenginePage(){ const {workspace}=useDashboardContext();return workspace ? <VolcengineView workspaceName={workspaceDisplayName(workspace.name)}/> : null; }
