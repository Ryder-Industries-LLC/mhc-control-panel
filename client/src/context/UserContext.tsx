import React, { createContext, useContext, useState, ReactNode } from 'react';

interface UserContextType {
  currentUsername: string;
  setCurrentUsername: (username: string) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Default to hudson_cage - the broadcaster who owns this control panel
  const [currentUsername, setCurrentUsername] = useState('hudson_cage');

  return (
    <UserContext.Provider value={{ currentUsername, setCurrentUsername }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    // GUARDRAIL: Safe fallback + dev warning per plan requirements
    if (process.env.NODE_ENV === 'development') {
      console.error('useUser called outside UserProvider');
    }
    return { currentUsername: 'hudson_cage', setCurrentUsername: () => {} };
  }
  return context;
};

export default UserContext;
