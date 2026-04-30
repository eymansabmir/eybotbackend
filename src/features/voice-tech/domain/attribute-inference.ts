export type AttributeType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'enum';

export function inferType(values: unknown[]): AttributeType {
  const normalized = values.filter((value) => value != null).map((value) => String(value).trim());
  const unique = [...new Set(normalized)];

  if (unique.length === 0) {
    return 'string';
  }

  if (unique.every((v) => v === 'true' || v === 'false')) {
    return 'boolean';
  }

  if (unique.every((v) => v !== '' && !Number.isNaN(Number(v)))) {
    return 'number';
  }

  if (unique.every((v) => !Number.isNaN(Date.parse(v)))) {
    return 'date';
  }

  if (unique.length <= 10) {
    return 'enum';
  }

  return 'string';
}

export function getOperators(type: AttributeType) {
  switch (type) {
    case 'number':
      return ['<', '>', '<=', '>=', 'equals', 'not_equals', 'in', 'not_in'];
    case 'string':
      return ['equals', 'not_equals', 'contains', 'in', 'not_in'];
    case 'enum':
      return ['equals', 'not_equals', 'in', 'not_in'];
    case 'boolean':
      return ['equals', 'not_equals'];
    case 'date':
      return ['<', '>', '<=', '>=', 'equals', 'not_equals'];
    default:
      return ['equals'];
  }
}
