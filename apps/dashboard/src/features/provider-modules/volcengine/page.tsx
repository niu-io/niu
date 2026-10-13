import { useDashboardContext } from '@/app/dashboard-context';
import { workspaceDisplayName } from '@/app/workspace-route';
import {useParams,useSearchParams,useNavigate,useLocation} from 'react-router';
import VolcengineView from './VolcengineView';
export default function VolcenginePage(){ const {workspace}=useDashboardContext();const {section}=useParams();const [search]=useSearchParams();const navigate=useNavigate(),location=useLocation();
const selection={keyId:search.get('key')??'',model:search.get('model')??''};
const selectContext=(next:{keyId:string;model:string})=>{const query=new URLSearchParams(search);if(next.keyId)query.set('key',next.keyId);else query.delete('key');if(next.model)query.set('model',next.model);else query.delete('model');navigate({pathname:location.pathname,search:query.size?`?${query}`:'',hash:location.hash});};
return workspace ? <VolcengineView key={`${workspace.id}:${section??'materials'}`} initialSection={section} selection={selection} onContextChange={selectContext} workspaceName={workspaceDisplayName(workspace.name)}/> : null; }
