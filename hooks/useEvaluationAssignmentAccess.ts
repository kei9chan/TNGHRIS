import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { hasCurrentUserEvaluationAssignment } from '../services/evaluationService';

export const useEvaluationAssignmentAccess = (enabled = true) => {
  const { user } = useAuth();
  const [hasAssignment, setHasAssignment] = useState(false);
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    let active = true;

    if (!enabled || !user) {
      setHasAssignment(false);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    hasCurrentUserEvaluationAssignment()
      .then(value => {
        if (active) setHasAssignment(value);
      })
      .catch(error => {
        console.error('Failed to check assigned evaluations', error);
        if (active) setHasAssignment(false);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [enabled, user?.id, user?.authUserId]);

  return { hasAssignment, loading };
};

