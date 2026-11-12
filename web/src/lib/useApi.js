import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

/**
 * Data-fetching hook with loading/error state, refetching and a manual setter
 * so callers can apply optimistic updates.
 */
export function useApi(path, { deps = [], skip = false, initialData = null } = {}) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(!skip);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);
  const mounted = useRef(true);
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchData = useCallback(
    async ({ silent = false } = {}) => {
      if (skip) return null;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await api.get(pathRef.current);
        if (!mounted.current) return null;
        // `data` is always the resource payload; pagination/aux info lives in `meta`.
        setData(res && 'data' in res ? res.data : res);
        setMeta(res?.meta ?? (res?.groups ? { groups: res.groups } : null));
        return res;
      } catch (err) {
        if (mounted.current) setError(err);
        return null;
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skip, ...deps]
  );

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  return { data, loading, error, meta, refresh: fetchData, setData, setMeta };
}

/** Debounce a rapidly changing value (search inputs). */
export function useDebounced(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mql.addEventListener('change', handler);
    setMatches(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota errors */
    }
  }, [key, value]);
  return [value, setValue];
}
