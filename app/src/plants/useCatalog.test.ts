import AsyncStorage from '@react-native-async-storage/async-storage';
import { CanceledError } from 'axios';
import { z } from 'zod';
import MockAdapter from 'axios-mock-adapter';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { api } from '../api/client';
import { changeLanguage, initI18n } from '../i18n';
import { catalogFixture } from './testFixtures';
import { useCatalog, type CatalogFilters } from './useCatalog';

let mock: MockAdapter;

const paramsSchema = z.object({
  light: z.string().optional(),
  page: z.number().optional(),
});

function paramsOf(config: { params?: unknown }) {
  return paramsSchema.parse(config.params ?? {});
}

const none: CatalogFilters = { search: '', light: null, difficulty: null };

function page(names: string[], nextPage: number | null) {
  return {
    items: names.map((name) => ({ ...catalogFixture, id: name, name })),
    nextPage,
  };
}

beforeAll(initI18n);

beforeEach(async () => {
  mock = new MockAdapter(api);
  await AsyncStorage.clear();
  await changeLanguage('en');
});

afterEach(() => {
  mock.restore();
  jest.useRealTimers();
});

describe('useCatalog', () => {
  it('loads page 1 with no params', async () => {
    mock.onGet('/plants').reply(200, page(['Aloe'], null));
    const { result } = renderHook(() => useCatalog(none));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.plants.map((p) => p.name)).toEqual(['Aloe']);
    expect(mock.history.get[0]?.params).toEqual({ search: undefined, light: undefined, difficulty: undefined });
  });

  it('fires one request with the search after 300 ms', async () => {
    jest.useFakeTimers();
    mock.onGet('/plants').reply(200, page([], null));
    const { result, rerender } = renderHook((f: CatalogFilters) => useCatalog(f), {
      initialProps: none,
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    mock.resetHistory();

    rerender({ ...none, search: 'o' });
    rerender({ ...none, search: 'or' });
    rerender({ ...none, search: 'orq' });
    act(() => {
      jest.advanceTimersByTime(299);
    });
    expect(mock.history.get).toHaveLength(0);
    act(() => {
      jest.advanceTimersByTime(1);
    });

    await waitFor(() => expect(mock.history.get).toHaveLength(1));
    expect(mock.history.get[0]?.params).toMatchObject({ search: 'orq' });
  });

  it('sends the light filter and goes back to page 1', async () => {
    mock.onGet('/plants').reply((config) => {
      const params = paramsOf(config);
      if (params.light === 'shade') return [200, page(['Fern'], null)];
      return [200, page(['Aloe'], 2)];
    });
    const { result, rerender } = renderHook((f: CatalogFilters) => useCatalog(f), {
      initialProps: none,
    });
    await waitFor(() => expect(result.current.plants).toHaveLength(1));
    act(() => result.current.loadMore());
    await waitFor(() => expect(mock.history.get.some((r) => paramsOf(r).page === 2)).toBe(true));

    rerender({ ...none, light: 'shade' });

    await waitFor(() => expect(result.current.plants.map((p) => p.name)).toEqual(['Fern']));
    const last = mock.history.get[mock.history.get.length - 1];
    expect(last?.params).toMatchObject({ light: 'shade' });
    expect(last && paramsOf(last).page).toBeUndefined();
  });

  it('requests page 2 only while nextPage is set', async () => {
    mock.onGet('/plants').reply((config) => {
      const params = paramsOf(config);
      return params.page === 2 ? [200, page(['B'], null)] : [200, page(['A'], 2)];
    });
    const { result } = renderHook(() => useCatalog(none));
    await waitFor(() => expect(result.current.plants).toHaveLength(1));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.plants.map((p) => p.name)).toEqual(['A', 'B']));
    expect(mock.history.get).toHaveLength(2);
    expect(mock.history.get[1]?.params).toMatchObject({ page: 2 });

    act(() => result.current.loadMore());
    expect(mock.history.get).toHaveLength(2);
  });

  it('keeps the old results visible while a new query loads', async () => {
    let release: () => void = () => undefined;
    mock.onGet('/plants').reply((config) => {
      if (paramsOf(config).light === 'shade') {
        return new Promise((resolve) => {
          release = () => resolve([200, page(['Fern'], null)]);
        });
      }
      return [200, page(['Aloe'], null)];
    });
    const { result, rerender } = renderHook((f: CatalogFilters) => useCatalog(f), {
      initialProps: none,
    });
    await waitFor(() => expect(result.current.plants).toHaveLength(1));

    rerender({ ...none, light: 'shade' });

    expect(result.current.plants.map((p) => p.name)).toEqual(['Aloe']);
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(true);
    await waitFor(() => expect(mock.history.get).toHaveLength(2));
    act(() => release());
    await waitFor(() => expect(result.current.plants.map((p) => p.name)).toEqual(['Fern']));
    expect(result.current.refreshing).toBe(false);
  });

  it('never appends an in-flight page 2 after the filters change', async () => {
    let releasePage2: () => void = () => undefined;
    mock.onGet('/plants').reply((config) => {
      const params = paramsOf(config);
      if (params.page === 2) {
        return new Promise((resolve) => {
          releasePage2 = () => resolve([200, page(['OldPage2'], null)]);
        });
      }
      return [200, page([params.light === 'shade' ? 'Fern' : 'Aloe'], 2)];
    });
    const { result, rerender } = renderHook((f: CatalogFilters) => useCatalog(f), {
      initialProps: none,
    });
    await waitFor(() => expect(result.current.plants).toHaveLength(1));
    act(() => result.current.loadMore());
    await waitFor(() => expect(mock.history.get).toHaveLength(2));

    rerender({ ...none, light: 'shade' });
    await waitFor(() => expect(result.current.plants.map((p) => p.name)).toEqual(['Fern']));
    act(() => releasePage2());
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.plants.map((p) => p.name)).toEqual(['Fern']);
  });

  it('sends one request for two loadMore calls in the same tick', async () => {
    mock.onGet('/plants').reply((config) =>
      paramsOf(config).page === 2 ? [200, page(['B'], null)] : [200, page(['A'], 2)],
    );
    const { result } = renderHook(() => useCatalog(none));
    await waitFor(() => expect(result.current.plants).toHaveLength(1));

    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });

    await waitFor(() => expect(result.current.plants).toHaveLength(2));
    expect(mock.history.get).toHaveLength(2);
  });

  it('shows no error for a canceled request', async () => {
    mock.onGet('/plants').reply(() => Promise.reject(new CanceledError()));
    const { result } = renderHook(() => useCatalog(none));
    await waitFor(() => expect(mock.history.get).toHaveLength(1));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.error).toBeNull();
  });

  it('drops a slow response from an older query', async () => {
    let releaseOld: () => void = () => undefined;
    mock.onGet('/plants').reply((config) => {
      const params = paramsOf(config);
      if (params.light === 'shade') {
        return new Promise((resolve) => {
          releaseOld = () => resolve([200, page(['Old'], null)]);
        });
      }
      return [200, page(['New'], null)];
    });
    const { result, rerender } = renderHook((f: CatalogFilters) => useCatalog(f), {
      initialProps: { ...none, light: 'shade' } satisfies CatalogFilters,
    });
    await waitFor(() => expect(mock.history.get).toHaveLength(1));

    rerender({ ...none, light: 'full_sun' });
    await waitFor(() => expect(result.current.plants.map((p) => p.name)).toEqual(['New']));
    act(() => releaseOld());

    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.plants.map((p) => p.name)).toEqual(['New']);
  });

  it('refetches when the app language changes', async () => {
    mock.onGet('/plants').reply((config) => {
      const lang: unknown = config.headers?.['Accept-Language'];
      return [200, page([lang === 'pt-BR' ? 'Jiboia' : 'Pothos'], null)];
    });
    const { result } = renderHook(() => useCatalog(none));
    await waitFor(() => expect(result.current.plants.map((p) => p.name)).toEqual(['Pothos']));

    await act(async () => {
      await changeLanguage('pt-BR');
    });

    await waitFor(() => expect(result.current.plants.map((p) => p.name)).toEqual(['Jiboia']));
    expect(mock.history.get).toHaveLength(2);
  });

  it('surfaces a network error and retry refetches', async () => {
    mock.onGet('/plants').networkErrorOnce();
    mock.onGet('/plants').reply(200, page(['Aloe'], null));
    const { result } = renderHook(() => useCatalog(none));
    await waitFor(() => expect(result.current.error?.code).toBe('network'));
    expect(result.current.loading).toBe(false);

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.plants.map((p) => p.name)).toEqual(['Aloe']));
    expect(result.current.error).toBeNull();
  });
});
