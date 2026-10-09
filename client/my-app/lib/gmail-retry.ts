export async function retryAndRefresh<T>(
  retry: () => Promise<T>,
  refresh: () => Promise<unknown>,
): Promise<{ result: T; refreshFailed: boolean; refreshError?: unknown }> {
  const result = await retry();
  try {
    await refresh();
    return { result, refreshFailed: false };
  } catch (refreshError) {
    return { result, refreshFailed: true, refreshError };
  }
}
