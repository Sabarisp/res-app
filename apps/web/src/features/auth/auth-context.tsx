'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppRole, LoginInput, UserDto } from '@restaurant/shared';
import { apiFetch } from '@/lib/api';

interface AuthContextType {
  user: UserDto | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<UserDto>;
  logout: () => Promise<void>;
  getRoleRedirect: (role: AppRole) => string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function getRoleRedirectPath(role: AppRole): string {
  switch (role) {
    case 'WAITER':
      return '/waiter';
    case 'CHEF':
      return '/kitchen';
    case 'CASHIER':
      return '/cashier';
    case 'MANAGER':
    case 'ADMIN':
      return '/admin';
    default:
      return '/';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await apiFetch<{ user: UserDto }>('/auth/me');
        setUser(res.user);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    checkAuth();
  }, []);

  const login = async (input: LoginInput): Promise<UserDto> => {
    const res = await apiFetch<{ user: UserDto }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setUser(res.user);
    return res.user;
  };

  const logout = async (): Promise<void> => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      router.push('/login');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        getRoleRedirect: getRoleRedirectPath,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
