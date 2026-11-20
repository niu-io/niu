import {
  Navigate,
  redirect,
  useLocation,
  useParams,
  type LoaderFunctionArgs,
} from 'react-router';
import { getActiveNavigationHash } from '@/shell/legacy-redirect-route';
import { guardrailsLegacyTarget } from './legacy';

function currentHash(): string {
  const locationHash =
    typeof window !== 'undefined' ? window.location.hash : '';
  return locationHash || getActiveNavigationHash();
}

export function clientLoader({ request, params }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(
    guardrailsLegacyTarget(
      url.pathname,
      url.search,
      currentHash(),
      params['*'],
    ),
  );
}

export default function GuardrailsLegacyRoute() {
  const location = useLocation();
  const params = useParams();
  if (!params['*']) return null;
  return (
    <Navigate
      replace
      to={guardrailsLegacyTarget(
        location.pathname,
        location.search,
        location.hash,
        params['*'],
      )}
    />
  );
}
