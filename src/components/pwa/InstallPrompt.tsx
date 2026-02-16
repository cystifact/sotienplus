'use client';

import { useState } from 'react';
import Image from 'next/image';
import { X, Share, PlusSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { usePwaInstall } from '@/hooks/use-pwa-install';

export function InstallPrompt() {
  const { showPrompt, isIos, triggerInstall, dismiss } = usePwaInstall();
  const [iosSheetOpen, setIosSheetOpen] = useState(false);

  if (!showPrompt) return null;

  const handleInstallClick = () => {
    if (isIos) {
      setIosSheetOpen(true);
    } else {
      triggerInstall();
    }
  };

  return (
    <>
      {/* Floating banner above mobile bottom nav */}
      <div
        className="fixed left-3 right-3 z-50 md:hidden animate-in slide-in-from-bottom-4 fade-in duration-500"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 64px)' }}
      >
        <div className="flex items-center gap-3 rounded-xl border bg-background/95 backdrop-blur p-3 shadow-lg supports-[backdrop-filter]:bg-background/80">
          <Image
            src="/icon-192x192.png"
            alt="SoTienPlus"
            width={40}
            height={40}
            className="rounded-lg shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">Cài đặt SoTienPlus</p>
            <p className="text-xs text-muted-foreground">
              Truy cập nhanh từ màn hình chính
            </p>
          </div>
          <Button size="sm" onClick={handleInstallClick} className="shrink-0">
            Cài đặt
          </Button>
          <button
            onClick={dismiss}
            className="shrink-0 p-1 rounded-full hover:bg-accent"
            aria-label="Đóng"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* iOS instruction sheet */}
      <Sheet open={iosSheetOpen} onOpenChange={setIosSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-center">
              Thêm SoTienPlus vào Màn hình chính
            </SheetTitle>
            <SheetDescription className="text-center">
              Làm theo 2 bước đơn giản:
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-2 pb-6">
            {/* Step 1 */}
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                1
              </div>
              <div>
                <p className="text-sm font-medium">
                  Nhấn vào nút{' '}
                  <Share className="inline h-4 w-4 mx-0.5 text-primary" />{' '}
                  Chia sẻ
                </p>
                <p className="text-xs text-muted-foreground">
                  (Ở thanh công cụ phía dưới của Safari)
                </p>
              </div>
            </div>
            {/* Step 2 */}
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                2
              </div>
              <div>
                <p className="text-sm font-medium">
                  Chọn{' '}
                  <PlusSquare className="inline h-4 w-4 mx-0.5 text-primary" />{' '}
                  &ldquo;Thêm vào Màn hình chính&rdquo;
                </p>
                <p className="text-xs text-muted-foreground">
                  Cuộn xuống nếu không thấy tùy chọn này
                </p>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
