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
import { Loader2, BookOpen } from 'lucide-react';

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
        : `${emailOrUsername}@soghitien.local`;

      await signInWithEmailAndPassword(auth, loginEmail, password);
      toast.success('Đăng nhập thành công');
      router.push('/ledger');
    } catch (error: unknown) {
      console.error('Login error:', error);
      const err = error as { code?: string };

      if (err.code === 'auth/invalid-credential') {
        toast.error('Username hoặc mật khẩu không đúng');
      } else if (err.code === 'auth/user-disabled') {
        toast.error('Tài khoản đã bị vô hiệu hóa');
      } else {
        toast.error('Đăng nhập thất bại. Vui lòng thử lại.');
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
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <BookOpen className="h-8 w-8" />
              </div>
              <div>
                <CardTitle className="text-3xl font-bold text-primary">
                  Sổ Ghi Tiền
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
                <Label htmlFor="emailOrUsername">Username</Label>
                <Input
                  id="emailOrUsername"
                  type="text"
                  placeholder="Nhập username"
                  value={emailOrUsername}
                  onChange={(e) => setEmailOrUsername(e.target.value)}
                  required
                  disabled={isLoading}
                />
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
