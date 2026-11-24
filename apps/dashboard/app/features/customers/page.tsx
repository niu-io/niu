import { useLocale as useUILocale } from '@/shell/ui-locale';
import type { LoaderFunctionArgs } from 'react-router';
import { loadCriticalRouteEndpoint, routeShouldRevalidate, useOptionalRouteLoaderData } from '@/lib/route-data';
import { canManagePlatform, useDashboardContext } from '@/shell/dashboard-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { Customers } from './customer-directory';
import { CUSTOMER_ACCOUNTS_PATH } from './customer-shared';
export { Customers };
export {
  CreditEditor,
  CreditsSummaryCell,
  type AccountPage,
  type Company,
  type CompanyMemberSummary,
  type CompanyOwnerSummary,
  type CompanyTransactionSummary,
  type CompanyWorkspaceSummary,
  type Editor,
} from './customer-shared';

export function clientLoader(args: LoaderFunctionArgs) {
  return loadCriticalRouteEndpoint(args, ({ snapshot }) => ({
    authorized: canManagePlatform(snapshot.session),
    endpoint: CUSTOMER_ACCOUNTS_PATH,
  }));
}

export const shouldRevalidate = routeShouldRevalidate;

export default function CustomersRoute() {
  useOptionalRouteLoaderData();
  const { t: uiT } = useUILocale();
  const context = useDashboardContext();
  if (!canManagePlatform(context.session)) {
    return (
      <Alert>
        <AlertTitle>{uiT("Platform administrator access required")}</AlertTitle>
        <AlertDescription>
          <p>{uiT("Your account does not have Platform administrator access. Ask an installation administrator to grant it.")}</p>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Customers
      key={context.token}
      token={context.token}
      canSetup={canManagePlatform(context.session)}
      onWorkspaceCreated={context.reloadWorkspaces}
    />
  );
}
