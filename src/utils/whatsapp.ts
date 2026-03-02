export function normalizeWaId(value: string): string {
  if (!value) {
    return value;
  }
  return value.trim().replace(/^\+/, '');
}
