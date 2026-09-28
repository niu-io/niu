import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

// Supplier-specific composition; controls are installed shadcn primitives.
export default function SupplierPropertiesFields({ supplierName }: { supplierName: string }) {
  const [name, setName] = useState(supplierName);
  const [endpoint, setEndpoint] = useState('');
  const [key, setKey] = useState('');
  return <div className="niu-modal-form">
    <Label htmlFor="supplier-property-name">Supplier name<Input id="supplier-property-name" value={name} onChange={event => setName(event.target.value)} /></Label>
    <Label htmlFor="supplier-endpoint">API endpoint<Input id="supplier-endpoint" type="url" placeholder="https://…" value={endpoint} onChange={event => setEndpoint(event.target.value)} /></Label>
    <Label htmlFor="supplier-credential">API key<Input id="supplier-credential" type="password" autoComplete="new-password" value={key} onChange={event => setKey(event.target.value)} /></Label>
    <p role="status">Supplier API settings cannot be loaded or saved until the backend links API configurations to supplier identities.</p>
    <div className="workspace-create-actions"><Button disabled>Save changes</Button></div>
  </div>;
}
