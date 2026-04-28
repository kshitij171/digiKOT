import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [role, setRole] = useState(localStorage.getItem('userRole') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const loginUser = (user, selectedRole) => {
    setCurrentUser(user);
    setRole(selectedRole);
    localStorage.setItem('userRole', selectedRole);
  };

  const logoutUser = () => {
    auth.signOut();
    setCurrentUser(null);
    setRole(null);
    localStorage.removeItem('userRole');
  };

  const value = {
    currentUser,
    role,
    loginUser,
    logoutUser
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
