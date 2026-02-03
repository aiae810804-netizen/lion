import { useState, useEffect } from 'react';
import { db } from '../../../services/storage';
import { ProcessRoute } from '../../../types';

export default function useRoutes() {
  const [routes, setRoutes] = useState<ProcessRoute[]>([]);
  useEffect(() => {
    let mounted = true;
    db.getRoutes().then(r => { if (mounted) setRoutes(r); }).catch(console.error);
    return () => { mounted = false; };
  }, []);
  return { routes, setRoutes };
}
