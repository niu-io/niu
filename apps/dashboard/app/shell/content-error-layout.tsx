import { Outlet, useOutletContext } from 'react-router';
import AppError from './route-error';

export const ErrorBoundary = AppError;

export default function ContentErrorLayout() {
  const context = useOutletContext();
  return <Outlet context={context} />;
}
