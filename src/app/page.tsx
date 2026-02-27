import { redirect } from 'next/navigation';

export default function HomePage() {
  // Middleware handles redirect for authenticated users
  // This is fallback for edge cases
  redirect('/login');
}
