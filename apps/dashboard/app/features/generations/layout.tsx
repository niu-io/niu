import { Outlet } from 'react-router';
import ConnectGate from '@/shell/ConnectGate';
import GenerationsLayout from './GenerationsLayout';

export default function GenerationsRouteLayout() {
  return <ConnectGate>{context => <GenerationsLayout><Outlet context={context} /></GenerationsLayout>}</ConnectGate>;
}
