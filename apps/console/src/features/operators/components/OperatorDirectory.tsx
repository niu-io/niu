import { Plus, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NamedResource, Operator } from '../api';

function displayScope(operator: Operator, organizations: NamedResource[], projects: NamedResource[]) {
  const organization = organizations.find(item => item.id === operator.organization_id)?.name ?? 'Organization';
  if (!operator.project_id) return organization + ' · all projects';
  const project = projects.find(item => item.id === operator.project_id)?.name ?? 'Project';
  return organization + ' · ' + project;
}

function roleLabel(role: Operator['role']) {
  return role[0].toUpperCase() + role.slice(1);
}

export default function OperatorDirectory({ operators, organizations, projects, selectedId, loading, disabled, projectScope, onSelect, onAdd }: {
  operators: Operator[];
  organizations: NamedResource[];
  projects: NamedResource[];
  selectedId: string;
  loading: boolean;
  disabled: boolean;
  projectScope: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  return <section className="panel operator-directory" aria-labelledby="operator-directory-title">
    <div className="operator-section-title"><div><h2 id="operator-directory-title">Directory</h2><p>{projectScope ? 'Organization-wide and project operators in this scope.' : 'Every operator in the selected organization.'}</p></div><span className="operator-count">{operators.length}</span></div>
    {loading
      ? <div className="operator-loading" role="status">Loading operators…</div>
      : operators.length === 0
        ? <div className="operator-empty"><span className="operator-empty-icon"><UsersRound size={19} /></span><strong>No operators in this scope</strong><p>Create a scoped operator to give someone access to Niu.</p><Button type="button" variant="outline" disabled={disabled} onClick={onAdd}><Plus size={15} />Add first operator</Button></div>
        : <div className="operator-list">
          {operators.map(operator => <button
            type="button"
            key={operator.id}
            className={'operator-entry' + (selectedId === operator.id ? ' is-selected' : '')}
            disabled={disabled}
            aria-pressed={selectedId === operator.id}
            onClick={() => onSelect(operator.id)}
          >
            <span className="operator-entry-avatar">{operator.name.trim().charAt(0).toUpperCase() || 'O'}</span>
            <span className="operator-entry-main"><strong>{operator.name}</strong><small>{displayScope(operator, organizations, projects)}</small></span>
            <span className={'operator-role-chip role-' + operator.role}>{roleLabel(operator.role)}</span>
            <span className={'operator-status-mark' + (operator.revoked ? ' is-revoked' : '')}>{operator.revoked ? 'Revoked' : 'Active'}</span>
          </button>)}
        </div>}
  </section>;
}
