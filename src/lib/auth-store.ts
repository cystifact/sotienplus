import { create } from 'zustand';
import { User } from 'firebase/auth';

interface AuthState {
  user: User | null;
  setUser: (user: User | null) => void;
  authChecked: boolean;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  authChecked: false,
  setUser: (user) => {
    set({ user, authChecked: true });
  },
}));
