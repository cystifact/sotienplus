'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from 'sonner';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';
import { setSessionHint } from '@/lib/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const loginEmail = emailOrUsername.includes('@')
        ? emailOrUsername
        : `${emailOrUsername}@sotienplus.local`;

      // Wait for Firebase Auth to finish initializing from IndexedDB
      // before attempting sign-in (prevents stale state conflicts)
      await auth.authStateReady();

      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, password);

      // Create session cookie BEFORE navigating so middleware allows the redirect
      const idToken = await userCredential.user.getIdToken();
      await fetch('/api/session/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ idToken }),
      });

      setSessionHint(true);
      toast.success('Đăng nhập thành công');
      router.push('/ledger');
    } catch (error: unknown) {
      console.error('Login error:', error);
      const err = error as { code?: string; message?: string };

      if (err.code === 'auth/invalid-credential') {
        toast.error('Username hoặc mật khẩu không đúng');
      } else if (err.code === 'auth/user-disabled') {
        toast.error('Tài khoản đã bị vô hiệu hóa');
      } else if (err.code === 'auth/network-request-failed') {
        toast.error('Lỗi kết nối mạng. Vui lòng kiểm tra internet.');
      } else {
        // Unknown error - likely browser extension or corrupted cache
        toast.error(
          'Đăng nhập thất bại. Thử tắt extension hoặc xoá cache trình duyệt (Ctrl+Shift+Delete).',
          { duration: 8000 }
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="pt-8">
            <div className="flex items-center justify-center gap-4">
              <Image
                src="/icon-192x192.png"
                alt="SoTienPlus"
                width={70}
                height={70}
                priority
              />
              <div>
                <CardTitle className="text-3xl font-bold text-primary">
                  SoTienPlus
                </CardTitle>
                <CardDescription className="mt-1 text-base">
                  Quản lý thu tiền khách hàng
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emailOrUsername">Username hoặc Email</Label>
                <Input
                  id="emailOrUsername"
                  type="text"
                  placeholder="Nhập username hoặc email"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  required
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Admin dùng email, nhân viên dùng username
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Đang đăng nhập...
                  </>
                ) : (
                  'Đăng nhập'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
