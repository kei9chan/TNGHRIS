import React from 'react';
import { useParams } from 'react-router-dom';
import EmployeeProfile from '../employees/EmployeeProfile';

const UserProfile: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  // EmployeeProfile reads the route params internally; this wrapper preserves
  // the dedicated /users/:userId slug while keeping the profile view in one place.
  return <EmployeeProfile key={userId} />;
};

export default UserProfile;
