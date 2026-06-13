import React, { createContext, useContext, useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  requestedRole: 'admin' | 'member';
  status: 'active' | 'invited' | 'disabled';
  approvalStatus: 'approved' | 'pending' | 'rejected';
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  avatar?: string;
  enterpriseId: string;   // ADDED
}

interface RegisterResult {
  success: boolean;
  requiresApproval: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  register: (name: string, email: string, password: string, requestedRole: 'admin' | 'member', enterpriseId: string) => Promise<RegisterResult>;
  requestPasswordReset: (email: string) => Promise<boolean>;
  resetPassword: (token: string, password: string) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper: set/remove Authorization header on the api instance
const setAuthHeader = (token: string | null) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

// Helper: load token from storage and set header
const loadTokenAndSetHeader = () => {
  const token = localStorage.getItem('docmind_token') || localStorage.getItem('token');
  if (token) {
    setAuthHeader(token);
    return token;
  }
  return null;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: unknown }).response === 'object' &&
    (error as { response?: { data?: unknown } }).response?.data &&
    typeof (error as { response?: { data?: { message?: unknown } } }).response?.data?.message === 'string'
  ) {
    return (error as { response?: { data?: { message?: string } } }).response?.data?.message || fallback;
  }
  return fallback;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // On mount: restore session from stored token
  useEffect(() => {
    const checkAuth = async () => {
      const token = loadTokenAndSetHeader(); // sets header if token exists
      if (token) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.data);
        } catch (error) {
          console.error('Auth check failed:', error);
          // Token invalid – clear everything
          localStorage.removeItem('docmind_token');
          localStorage.removeItem('token');
          setAuthHeader(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };
    checkAuth();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const token = res.data.token;
      if (token) {
        // Store token with both keys for compatibility
        localStorage.setItem('docmind_token', token);
        localStorage.setItem('token', token);
        // Attach token to all future requests
        setAuthHeader(token);
      }

      // Set user state
      if (res.data.user) {
        setUser(res.data.user);
      } else if (res.data.userId) {
        // Fallback for unexpected response format
        setUser({
          id: res.data.userId,
          name: email.split('@')[0],
          email: email,
          role: res.data.role || 'member',
          requestedRole: 'member',
          status: 'active',
          approvalStatus: 'approved',
          lastLoginAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          enterpriseId: res.data.enterpriseId || '',
        });
      }

      toast({
        title: "Welcome back!",
        description: "You have successfully signed in.",
      });
      return true;
    } catch (error: unknown) {
      console.error('Login error:', error);
      toast({
        title: "Sign in failed",
        description: getErrorMessage(error, "Please check your credentials."),
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    requestedRole: 'admin' | 'member',
    enterpriseId: string,
  ): Promise<RegisterResult> => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/register', { name, email, password, requestedRole, enterpriseId });

      if (res.data.requiresApproval) {
        toast({
          title: "Request submitted",
          description: "Your admin account request is waiting for approval.",
        });
        return { success: true, requiresApproval: true };
      }

      const token = res.data.token;
      if (token) {
        localStorage.setItem('docmind_token', token);
        localStorage.setItem('token', token);
        setAuthHeader(token);
      }

      setUser(res.data.user);

      toast({
        title: "Account created!",
        description: "Welcome to DocMind.",
      });

      return { success: true, requiresApproval: false };
    } catch (error: unknown) {
      toast({
        title: "Registration failed",
        description: getErrorMessage(error, "Please try again later."),
        variant: "destructive"
      });
      return { success: false, requiresApproval: false };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('docmind_token');
    localStorage.removeItem('token');
    setAuthHeader(null);
    setUser(null);
    toast({
      title: "Logged out",
      description: "You have been successfully logged out.",
    });
  };

  const loginWithGoogle = async (): Promise<boolean> => {
    toast({
      title: "Coming Soon",
      description: "Google login is not yet configured with the backend.",
    });
    return false;
  };

  const requestPasswordReset = async (email: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/request-password-reset', { email });
      toast({
        title: "Reset requested",
        description: res.data.previewPath
          ? `Reset email prepared. Preview saved to ${res.data.previewPath}.`
          : "Reset email sent.",
      });
      return true;
    } catch (error: unknown) {
      toast({
        title: "Request failed",
        description: getErrorMessage(error, "Could not start password reset."),
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (token: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      toast({
        title: "Password updated",
        description: "You can now sign in with your new password.",
      });
      return true;
    } catch (error: unknown) {
      toast({
        title: "Reset failed",
        description: getErrorMessage(error, "Could not reset the password."),
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        loginWithGoogle,
        register,
        requestPasswordReset,
        resetPassword,
        logout,
        isLoading
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};