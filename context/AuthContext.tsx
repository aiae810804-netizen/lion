import React, { createContext, useContext, useState, useCallback } from 'react';
import { User } from '../types';
import { db } from '../services/storage';

export interface AuthContextType {
  user: User | null;
  login: (username: string, password?: string) => Promise<boolean>;
  logout: () => void;
}

export const AuthContext = React.createContext<AuthContextType>({
  user: null,
  login: async () => false,
  logout: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Moved Auth Provider logic here to wrap Context logic properly if needed, but for now App.tsx handles state
    // This file acts mainly as the Interface definition to avoid circular deps if extended.
    return <>{children}</>;
}