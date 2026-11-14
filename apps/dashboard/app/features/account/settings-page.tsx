import { Navigate, useLocation, useParams } from 'react-router';
import { useDashboardContext } from '@/shell/dashboard-context';
import { SettingsContent } from './settings-shell';
import { canonicalSettingsSection } from './settings-routes';

export { SettingsContent } from './settings-shell';
export { SettingsNavigation } from './settings-navigation';
export { settingsHref } from './settings-routes';

export default function SettingsPage() {
  const context = useDashboardContext();
  const location = useLocation();
  const { section } = useParams();
  const canonical = canonicalSettingsSection(section, context.session);
  if (section !== canonical) return <Navigate replace state={location.state} to={`/settings/${canonical}${location.search}${location.hash}`} />;
  return <SettingsContent context={context} section={section} />;
}
