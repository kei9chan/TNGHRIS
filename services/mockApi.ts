
import { User } from '../types';
import { mockUsers } from './mockData';

export const mockLogin = (email: string, pass: string): Promise<User | null> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const user = mockUsers.find(u => u.email === email);
      // In a real app, you'd check the password. Here we just check if user exists.
      if (user && pass) {
        resolve(user);
      } else {
        resolve(null);
      }
    }, 1000);
  });
};

export const mockLogout = (): void => {
  // In a real app, this might invalidate a token on the server
  console.log("User logged out");
};
