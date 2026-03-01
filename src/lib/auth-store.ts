import { create } from 'zustand';
import { User } from 'firebase/auth';

const SESSION_HINT_KEY = 'hasSession';

function getSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setSessionHint(value: boolean) {
  try {
    if (value) {
      localStorage.setItem(SESSION_HINT_KEY, 'true');
    } else {
      localStorage.removeItem(SESSION_HINT_KEY);
    }
  } catch {
    // localStorage unavailable
  }
}

interface AuthState {
  user: User | null;
  setUser: (user: User | null) => void;
  authChecked: boolean;
  sessionHint: boolean;
  clearSessionHint: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  authChecked: false,
  sessionHint: getSessionHint(),
  setUser: (user) => {
    set({ user, authChecked: true });
  },
  clearSessionHint: () => {
    setSessionHint(false);
    set({ sessionHint: false });
  },
}));
