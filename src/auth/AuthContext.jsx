/**
 * AuthContext.jsx
 *
 * Provides authentication state to the entire component tree via React context.
 *
 * Usage:
 *   const { user, logout, setSession } = useAuth();
 *
 * `user` shape: { role: 'parent' | 'kid', kidId: number | null, name: string }
 * `user` is null when no valid session exists.
 *
 * `setSession` is called directly after a successful PIN login so the UI
 * updates instantly without a second async JWT verification round-trip.
 *
 * When swapping in Google OAuth later:
 *   1. Replace loginAsParent / loginAsKid calls in LoginPage with OAuth flow.
 *   2. After the OAuth callback issues a JWT, call setSession with the decoded
 *      payload — everything downstream stays the same.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { getCurrentUser, logout as authLogout } from './authService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, check for an existing valid session (e.g. after a page refresh).
  useEffect(() => {
    getCurrentUser().then(u => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const logout = () => {
    authLogout();
    setUser(null);
  };

  // Called immediately after a successful login to avoid a second async verify.
  const setSession = (u) => setUser(u);

  // Don't render children until the session check is complete, to prevent a
  // flash of the login page before a valid stored session is restored.
  if (loading) return null;

  return (
    <AuthContext.Provider value={{ user, logout, setSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
