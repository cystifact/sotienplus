'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Eye,
  Plus,
  Edit,
  Trash2,
  CheckSquare,
  CheckCheck,
  Download,
  Bot,
  Settings,
  DollarSign,
} from 'lucide-react';
import {
  Permission,
  UserRole,
  MODULE_LABELS,
  getDefaultPermissions,
  groupByModule,
} from '@/lib/permissions-config';

interface UserPermissionsGridProps {
  role: UserRole;
  currentPermissions: Permission[];
  onChange: (permissions: Permission[]) => void;
  disabled?: boolean;
}

const getActionIcon = (action: string) => {
  switch (action) {
    case 'view': return <Eye className="h-3.5 w-3.5" />;
    case 'create': return <Plus className="h-3.5 w-3.5" />;
    case 'edit': return <Edit className="h-3.5 w-3.5" />;
    case 'delete': return <Trash2 className="h-3.5 w-3.5" />;
    case 'check': return <CheckSquare className="h-3.5 w-3.5" />;
    case 'bulk_check': return <CheckCheck className="h-3.5 w-3.5" />;
    case 'view_total': return <DollarSign className="h-3.5 w-3.5" />;
    case 'export': return <Download className="h-3.5 w-3.5" />;
    case 'rpa_sync': return <Bot className="h-3.5 w-3.5" />;
    case 'configure': return <Settings className="h-3.5 w-3.5" />;
    case 'sync': return <Bot className="h-3.5 w-3.5" />;
    default: return <Settings className="h-3.5 w-3.5" />;
  }
};

export function UserPermissionsGrid({
  role,
  currentPermissions,
  onChange,
  disabled = false,
}: UserPermissionsGridProps) {
  const [permissions, setPermissions] = useState<Permission[]>([]);

  // Serialize to stable key so useEffect only fires on actual data changes,
  // not on new array references (e.g. `|| []` creating new empty arrays)
  const currentPermsKey = currentPermissions
    .map((p) => `${p.module}:${p.action}:${p.granted}`)
    .join(',');

  useEffect(() => {
    const defaults = getDefaultPermissions(role);
    const overrideMap = new Map(currentPermissions.map((p) => [`${p.module}:${p.action}`, p.granted]));
    const effective = defaults.map((p) => {
      const overrideGranted = overrideMap.get(`${p.module}:${p.action}`);
      return overrideGranted !== undefined ? { ...p, granted: overrideGranted } : p;
    });
    setPermissions(effective);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, currentPermsKey]);

  const emitOverrides = (updated: Permission[]) => {
    const defaults = getDefaultPermissions(role);
    const defaultMap = new Map(defaults.map((p) => [`${p.module}:${p.action}`, p.granted]));
    const overrides = updated.filter((p) => {
      const defaultGranted = defaultMap.get(`${p.module}:${p.action}`) ?? false;
      return p.granted !== defaultGranted;
    });
    onChange(overrides);
  };

  const handleToggle = (module: string, action: string, checked: boolean) => {
    const updated = permissions.map((p) =>
      p.module === module && p.action === action ? { ...p, granted: checked } : p
    );
    setPermissions(updated);
    emitOverrides(updated);
  };

  const handleGrantAll = () => {
    const allGranted = permissions.map((p) => ({ ...p, granted: true }));
    setPermissions(allGranted);
    emitOverrides(allGranted);
  };

  const handleRevokeAll = () => {
    const allRevoked = permissions.map((p) => ({ ...p, granted: false }));
    setPermissions(allRevoked);
    emitOverrides(allRevoked);
  };

  const handleResetToDefault = () => {
    const defaults = getDefaultPermissions(role);
    setPermissions(defaults);
    onChange([]);
  };

  const grouped = groupByModule(permissions);
  const grantedCount = permissions.filter((p) => p.granted).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          <Badge variant="outline" className="text-xs">
            {grantedCount} / {permissions.length} quyền
          </Badge>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={handleGrantAll} disabled={disabled} className="text-xs h-7">
            Cấp tất cả
          </Button>
          <Button variant="outline" size="sm" onClick={handleRevokeAll} disabled={disabled} className="text-xs h-7">
            Thu hồi
          </Button>
          <Button variant="ghost" size="sm" onClick={handleResetToDefault} disabled={disabled} className="text-xs h-7">
            Mặc định
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(grouped).map(([moduleName, modulePerms]) => {
          const moduleGranted = modulePerms.filter((p) => p.granted).length;
          return (
            <Card key={moduleName}>
              <CardHeader className="py-2.5 px-4">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  {MODULE_LABELS[moduleName] || moduleName}
                  <Badge variant="secondary" className="text-[10px]">
                    {moduleGranted}/{modulePerms.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="py-2 px-4 space-y-1.5">
                {modulePerms.map((perm) => (
                    <div
                      key={`${perm.module}:${perm.action}`}
                      className="flex items-center gap-2"
                    >
                      <Checkbox
                        id={`perm-${perm.module}-${perm.action}`}
                        checked={perm.granted}
                        onCheckedChange={(checked) =>
                          handleToggle(perm.module, perm.action, !!checked)
                        }
                        disabled={disabled}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <Label
                        htmlFor={`perm-${perm.module}-${perm.action}`}
                        className="text-xs flex items-center gap-1.5 cursor-pointer flex-1"
                      >
                        <span className={perm.granted ? 'text-primary' : 'text-muted-foreground'}>
                          {getActionIcon(perm.action)}
                        </span>
                        <span className={perm.granted ? 'font-medium' : 'text-muted-foreground'}>
                          {perm.label}
                        </span>
                      </Label>
                    </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
