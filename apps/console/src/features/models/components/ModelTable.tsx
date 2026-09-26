import { Boxes } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Model } from '@/app/console-context';

export default function ModelTable({ models }: { models: Model[] }) {
  if (models.length === 0) return <div className="empty-state">
    <div className="empty-icon"><Boxes size={18} /></div>
    <strong>No model routes yet</strong>
    <span>Add a model route to the gateway configuration to see it here.</span>
  </div>;

  return <div className="table-wrap"><Table>
    <TableHeader><TableRow><TableHead>MODEL</TableHead><TableHead>PROVIDER</TableHead><TableHead>UPSTREAM MODEL</TableHead><TableHead>PUBLIC CATALOG</TableHead><TableHead>STATUS</TableHead></TableRow></TableHeader>
    <TableBody>{models.map(model => <TableRow key={model.id}>
      <TableCell><span className="model-mark"><Boxes size={16} /></span><strong>{model.id}</strong></TableCell>
      <TableCell><Badge variant="outline">{model.provider}</Badge></TableCell>
      <TableCell className="mono">{model.upstream_model}</TableCell>
      <TableCell><Badge variant={model.public_catalog ? 'default' : 'outline'}>{model.public_catalog ? 'Published' : 'Hidden'}</Badge></TableCell>
      <TableCell><span className="status-pill online"><span className="status-dot" />Configured</span></TableCell>
    </TableRow>)}</TableBody>
  </Table></div>;
}
