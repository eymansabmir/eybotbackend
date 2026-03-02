export function pruneUndefined<T extends Record<string, unknown>>(data: Partial<T>): Partial<T> {
  return Object.entries(data).reduce<Partial<T>>((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key as keyof T] = value as T[keyof T];
    }
    return acc;
  }, {});
}
