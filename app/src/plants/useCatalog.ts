import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogPlant, Difficulty, Light } from '@plantcare/shared';

import { toApiError, type ApiError } from '../api/client';
import { listCatalog } from '../api/endpoints';

export interface CatalogFilters {
  search: string;
  light: Light | null;
  difficulty: Difficulty | null;
}

const SEARCH_DEBOUNCE_MS = 300;

interface CatalogState {
  /** The query these results belong to; a different key means they are stale. */
  key: string;
  plants: CatalogPlant[];
  nextPage: number | null;
  loadingMore: boolean;
  error: ApiError | null;
}

function queryKey(parts: unknown[]) {
  return JSON.stringify(parts);
}

/**
 * Species from the API for the current filters. The search is debounced; changing a filter or the
 * app language starts over from page 1, and a response for an older query is dropped.
 */
export function useCatalog(filters: CatalogFilters) {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const { light, difficulty } = filters;

  const [debouncedSearch, setDebouncedSearch] = useState(filters.search.trim());
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<CatalogState | null>(null);
  const requestId = useRef(0);
  const moreController = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(filters.search.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [filters.search]);

  const key = queryKey([debouncedSearch, light, difficulty, language, attempt]);

  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;
    const search = debouncedSearch || undefined;

    listCatalog(
      { search, light: light ?? undefined, difficulty: difficulty ?? undefined },
      controller.signal,
    )
      .then((page) => {
        if (id !== requestId.current) return;
        setState({ key, plants: page.items, nextPage: page.nextPage, loadingMore: false, error: null });
      })
      .catch((e: unknown) => {
        const error = toApiError(e);
        if (error.code === 'canceled' || id !== requestId.current) return;
        setState({ key, plants: [], nextPage: null, loadingMore: false, error });
      });

    return () => {
      controller.abort();
      moreController.current?.abort();
    };
  }, [key, debouncedSearch, light, difficulty]);

  const current = state?.key === key ? state : null;

  const fetchMore = useCallback(
    (from: CatalogState) => {
      if (from.nextPage === null || from.loadingMore) return;
      const controller = new AbortController();
      moreController.current = controller;
      const id = ++requestId.current;
      const page = from.nextPage;
      setState({ ...from, loadingMore: true, error: null });

      listCatalog(
        {
          search: debouncedSearch || undefined,
          light: light ?? undefined,
          difficulty: difficulty ?? undefined,
          page,
        },
        controller.signal,
      )
        .then((result) => {
          if (id !== requestId.current) return;
          setState({
            key: from.key,
            plants: [...from.plants, ...result.items],
            nextPage: result.nextPage,
            loadingMore: false,
            error: null,
          });
        })
        .catch((e: unknown) => {
          const error = toApiError(e);
          if (error.code === 'canceled' || id !== requestId.current) return;
          setState({ ...from, loadingMore: false, error });
        });
    },
    [debouncedSearch, light, difficulty],
  );

  const loadMore = useCallback(() => {
    if (current && !current.error) fetchMore(current);
  }, [current, fetchMore]);

  const retry = useCallback(() => {
    // A failed next page is retried on its own; anything else starts over.
    if (current && current.plants.length > 0 && current.nextPage !== null) fetchMore(current);
    else setAttempt((n) => n + 1);
  }, [current, fetchMore]);

  return {
    plants: current?.plants ?? [],
    loading: current === null,
    loadingMore: current?.loadingMore ?? false,
    error: current?.error ?? null,
    loadMore,
    retry,
  };
}
