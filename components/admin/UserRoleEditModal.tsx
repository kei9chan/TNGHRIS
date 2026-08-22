import React, { useEffect, useMemo, useState } from 'react';
import { AccessScope, BusinessUnit, DashboardType, Permission, User } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

export interface RoleOption {
  id: string;
  dashboardType: DashboardType;
  permissions: Record<string, Permission[]>;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  businessUnits: BusinessUnit[];
  roles: RoleOption[];
  onSave: (userId: string, roleId: string, accessScope: AccessScope) => Promise<void>;
}

const UserRoleEditModal: React.FC<Props> = ({
  isOpen,
  onClose,
  user,
  onSave,
  businessUnits,
  roles,
}) => {
  const [roleId, setRoleId] = useState(user.role);
  const [scopeType, setScopeType] = useState<AccessScope['type']>('HOME_ONLY');
  const [selectedBuIds, setSelectedBuIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRoleId(user.role);
    setScopeType(user.accessScope?.type || 'HOME_ONLY');
    setSelectedBuIds(user.accessScope?.allowedBuIds || []);
    setError(null);
  }, [isOpen, user]);

  const role = useMemo(() => roles.find(item => item.id === roleId), [roleId, roles]);
  const allowedBusinessUnits =
    scopeType === 'GLOBAL'
      ? businessUnits
      : scopeType === 'SPECIFIC'
        ? businessUnits.filter(unit => selectedBuIds.includes(unit.id))
        : businessUnits.filter(unit => unit.id === user.businessUnitId);
  const permissionLines = Object.entries((role?.permissions || {}) as Record<string, Permission[]>)
    .filter(([, actions]) => actions.length > 0)
    .map(([resource, actions]) => `${resource}: ${actions.join(', ')}`);

  const handleSave = async () => {
    if (!roles.some(item => item.id === roleId)) {
      setError('Select a valid role.');
      return;
    }
    if (scopeType === 'SPECIFIC' && selectedBuIds.length === 0) {
      setError('Select at least one business unit for Specific access.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(user.id, roleId, {
        type: scopeType,
        allowedBuIds: scopeType === 'SPECIFIC' ? selectedBuIds : undefined,
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save access.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Access for ${user.name}`}
      footer={
        <div className="flex w-full justify-end space-x-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} isLoading={saving} disabled={saving}>Save Changes</Button>
        </div>
      }
    >
      <div className="space-y-6">
        {error && <div className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        <div>
          <label htmlFor="role-select" className="mb-1 block text-sm font-medium">System Role</label>
          <select id="role-select" value={roleId} onChange={event => setRoleId(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 dark:bg-slate-700">
            {roles.map(item => <option key={item.id} value={item.id}>{item.id}</option>)}
          </select>
        </div>
        <fieldset>
          <legend className="mb-3 text-sm font-medium">Data Access Scope</legend>
          {([
            ['HOME_ONLY', 'Home Unit Only'],
            ['GLOBAL', 'All Business Units'],
            ['SPECIFIC', 'Specific Business Units'],
          ] as const).map(([value, label]) => (
            <label key={value} className="mb-2 flex items-center gap-2 text-sm">
              <input type="radio" checked={scopeType === value} onChange={() => setScopeType(value)} />
              {label}
            </label>
          ))}
          {scopeType === 'SPECIFIC' && (
            <div className="mt-3 max-h-40 overflow-y-auto rounded border p-3">
              {businessUnits.map(unit => (
                <label key={unit.id} className="mb-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedBuIds.includes(unit.id)}
                    onChange={() => setSelectedBuIds(ids => ids.includes(unit.id) ? ids.filter(id => id !== unit.id) : [...ids, unit.id])}
                  />
                  {unit.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <section className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <h3 className="font-semibold text-indigo-950">Effective Access Preview</h3>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="font-medium">Role</dt><dd>{roleId}</dd>
            <dt className="font-medium">Dashboard</dt><dd>{role?.dashboardType || 'Not configured'}</dd>
            <dt className="font-medium">Scope</dt><dd>{scopeType}</dd>
            <dt className="font-medium">Units</dt><dd>{allowedBusinessUnits.map(unit => unit.name).join(', ') || 'None'}</dd>
          </dl>
          <div className="mt-3 max-h-36 overflow-y-auto text-xs text-indigo-900">
            {permissionLines.length > 0 ? permissionLines.map(line => <div key={line}>{line}</div>) : 'No permissions granted.'}
          </div>
        </section>
      </div>
    </Modal>
  );
};

export default UserRoleEditModal;
