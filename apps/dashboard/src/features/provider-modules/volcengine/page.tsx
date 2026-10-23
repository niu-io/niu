import { useDashboardContext } from '@/app/dashboard-context';
import { workspaceDisplayName, workspacePathSegment } from '@/app/workspace-route';
import {Link,useParams,useSearchParams,useNavigate,useLocation} from 'react-router';
import VolcengineView from './VolcengineView';
export default function VolcenginePage(){ const {workspace,workspaces}=useDashboardContext();const {section}=useParams();const [search]=useSearchParams();const navigate=useNavigate(),location=useLocation();
const selection={keyId:search.get('key')??'',model:search.get('model')??''};
const selectContext=(next:{keyId:string;model:string})=>{const query=new URLSearchParams(search);if(next.keyId)query.set('key',next.keyId);else query.delete('key');if(next.model)query.set('model',next.model);else query.delete('model');navigate({pathname:location.pathname,search:query.size?`?${query}`:'',hash:location.hash});};
return workspace ? <div className="space-y-4"><p className="text-sm text-muted-foreground">Manage materials and identity verification required by your video Provider. Create videos and revisit previous results in <Link className="underline underline-offset-4" to={`/generations?new=video&workspace=${encodeURIComponent(workspacePathSegment(workspace,workspaces))}`}>Generations</Link>. Available tools depend on the selected model.</p><VolcengineView key={`${workspace.id}:${section??'materials'}`} initialSection={section} selection={selection} onContextChange={selectContext} workspaceName={workspaceDisplayName(workspace.name)}/></div> : null; }
