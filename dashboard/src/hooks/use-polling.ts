"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function usePolling<T>(url: string, interval = 5000) {
  const { data, error, isLoading, mutate } = useSWR<T>(url, fetcher, {
    refreshInterval: interval,
    revalidateOnFocus: true,
  });

  return { data, error, isLoading, refresh: mutate };
}
