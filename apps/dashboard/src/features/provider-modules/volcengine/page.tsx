import { useDashboardContext } from '@/app/dashboard-context';
import { workspaceDisplayName } from '@/app/workspace-route';
import {useParams} from 'react-router';
import VolcengineView from './VolcengineView';
export default function VolcenginePage(){ const {workspace}=useDashboardContext();const {section}=useParams();return workspace ? <VolcengineView key={section} initialSection={section} workspaceName={workspaceDisplayName(workspace.name)}/> : null; }
