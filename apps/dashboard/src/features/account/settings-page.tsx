import { useLocation, useNavigate, useParams } from 'react-router';
import { useDashboardContext } from '@/app/dashboard-context';
import { SettingsDialog, settingsReturnDestination } from './settings-shell';

// Shared shell exports remain available here for existing consumers/tests, but
// application code imports settings-shell directly so this page stays lazy.
export {
  SettingsDialog,
  SettingsNavigation,
  settingsHref,
  settingsReturnDestination,
} from './settings-shell';

export default function SettingsPage() {
  const context = useDashboardContext();
  const location = useLocation();
  const navigate = useNavigate();
  const fallback = '/workspaces/default';
  const returnTo = settingsReturnDestination(location.state?.settingsReturnTo, fallback);
  const {section} = useParams();
  return <SettingsDialog context={context} section={section} onClose={() => navigate(returnTo,{replace:true})}/>;
}
