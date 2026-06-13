import { useState, useMemo } from 'react';
import Fuse from 'fuse.js';

interface SearchableItem {
  id: string;
  [key: string]: any;
}

interface UseSearchOptions<T> {
  keys: string[];
  threshold?: number;
  includeScore?: boolean;
  shouldSort?: boolean;
}

export const useSearch = <T extends SearchableItem>(
  items: T[],
  options: UseSearchOptions<T>
) => {
  const [searchQuery, setSearchQuery] = useState('');

  const fuse = useMemo(() => {
    return new Fuse(items, {
      keys: options.keys,
      threshold: options.threshold ?? 0.3,
      includeScore: options.includeScore ?? false,
      shouldSort: options.shouldSort ?? true,
      minMatchCharLength: 2,
      ignoreLocation: true,
    });
  }, [items, options.keys, options.threshold, options.includeScore, options.shouldSort]);

  const results = useMemo(() => {
    if (!searchQuery.trim()) {
      return items;
    }

    const searchResults = fuse.search(searchQuery);
    return searchResults.map(result => result.item);
  }, [fuse, searchQuery, items]);

  return {
    searchQuery,
    setSearchQuery,
    results,
    hasQuery: searchQuery.trim().length > 0
  };
};