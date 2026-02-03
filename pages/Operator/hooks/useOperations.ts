import { useState, useEffect } from 'react';
import { db } from '../../../services/storage';
import { Operation } from '../../../types';

export default function useOperations(selectedRouteId?: string | null, allOperationsList?: Operation[]) {
  const [operations, setOperations] = useState<Operation[]>([]);

  useEffect(() => {
    if (!selectedRouteId || !allOperationsList) { setOperations([]); return; }
    const ops: Operation[] = [];
    const routeSteps = allOperationsList; // placeholder, caller maps steps
    // Caller should pass filtered list; keep simple here
    setOperations(allOperationsList.filter(o => !!o));
  }, [selectedRouteId, allOperationsList]);

  return { operations, setOperations };
}
