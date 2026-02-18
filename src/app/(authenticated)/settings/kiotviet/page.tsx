'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUserPermissions } from '@/hooks/use-current-user-permissions';

export default function KiotVietSettingsPage() {
  const { hasPermission, hasAnyModulePermission, isLoading } = useCurrentUserPermissions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!hasAnyModulePermission('kiotviet')) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Bạn không có quyền truy cập trang này.
      </div>
    );
  }

  const canViewConfig = hasPermission('kiotviet', 'view');
  const canConfigure = hasPermission('kiotviet', 'configure');
  const canSync = hasPermission('kiotviet', 'sync');

  return <KiotVietContent canViewConfig={canViewConfig} canConfigure={canConfigure} canSync={canSync} />;
}

function KiotVietContent({ canViewConfig, canConfigure, canSync }: { canViewConfig: boolean; canConfigure: boolean; canSync: boolean }) {
  const [formData, setFormData] = useState({
    clientId: '',
    clientSecret: '',
    retailerCode: '',
  });
  const [formLoaded, setFormLoaded] = useState(false);

  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.customers.getSettings.useQuery();

  // Populate form when settings load
  useEffect(() => {
    if (!formLoaded && settings && settings.configured) {
      const s = settings as any;
      setFormData({
        clientId: s.clientId || '',
        clientSecret: '',
        retailerCode: s.retailerCode || '',
      });
      setFormLoaded(true);
    }
  }, [settings, formLoaded]);

  const saveMutation = trpc.customers.saveSettings.useMutation({
    onSuccess: () => {
      utils.customers.getSettings.invalidate();
      toast.success('Lưu cấu hình thành công');
    },
    onError: (err) => toast.error(err.message),
  });

  const testMutation = trpc.customers.testConnection.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success('Kết nối thành công!');
      } else {
        toast.error(`Kết nối thất bại: ${data.error}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const syncMutation = trpc.customers.sync.useMutation({
    onSuccess: (data) => {
      utils.customers.getSettings.invalidate();
      utils.customers.list.invalidate();
      toast.success(`Đồng bộ thành công: ${data.synced} khách hàng`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientSecret && !(settings as any)?.hasSecret) {
      toast.error('Vui lòng nhập Client Secret');
      return;
    }
    // If secret is empty and already saved, keep old secret
    if (!formData.clientSecret) {
      toast.error('Vui lòng nhập Client Secret');
      return;
    }
    saveMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const s = settings as any;

  return (
    <div className="space-y-6">
      <h1 className="text-lg sm:text-2xl font-bold">Cài đặt KiotViet</h1>

      {(canViewConfig || canConfigure) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Thông tin kết nối
            </CardTitle>
            <CardDescription>
              Nhập thông tin API từ KiotViet Developer Portal
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="retailerCode">Retailer Code</Label>
                <Input
                  id="retailerCode"
                  value={formData.retailerCode}
                  onChange={(e) => setFormData({ ...formData, retailerCode: e.target.value })}
                  disabled={!canConfigure}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientId">Client ID</Label>
                <Input
                  id="clientId"
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  disabled={!canConfigure}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientSecret">Client Secret</Label>
                <Input
                  id="clientSecret"
                  type="password"
                  value={formData.clientSecret}
                  onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
                  placeholder={s?.hasSecret ? 'Đã lưu — nhập mới để thay đổi' : 'Nhập client secret'}
                  disabled={!canConfigure}
                  required={!s?.hasSecret}
                />
              </div>
              {canConfigure && (
                <div className="flex gap-2">
                  <Button type="submit" disabled={saveMutation.isPending}>
                    {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Lưu cấu hình
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => testMutation.mutate()}
                    disabled={testMutation.isPending || !s?.configured}
                  >
                    {testMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Test kết nối
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {canSync && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Đồng bộ khách hàng
            </CardTitle>
            <CardDescription>
              Đồng bộ danh sách khách hàng từ KiotViet vào hệ thống
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {s?.configured ? (
              <>
                <div className="flex items-center gap-4 p-3 bg-muted rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Lần đồng bộ gần nhất</p>
                    <p className="text-xs text-muted-foreground">
                      {s.lastCustomerSync ? 'Đã đồng bộ' : 'Chưa đồng bộ'}
                    </p>
                  </div>
                  {s.lastCustomerCount > 0 && (
                    <Badge variant="secondary">
                      {s.lastCustomerCount} khách hàng
                    </Badge>
                  )}
                </div>
                <Button
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                >
                  {syncMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  {syncMutation.isPending ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Vui lòng cấu hình kết nối KiotViet trước khi đồng bộ.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
