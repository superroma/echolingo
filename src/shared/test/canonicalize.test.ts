import { describe, it, expect } from 'vitest';
import { canonicalize } from '../src/canonicalize.js';

describe('canonicalize', () => {
  it('sorts object keys deterministically', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it('handles nested objects', () => {
    expect(canonicalize({ b: { y: 1, x: 2 }, a: 1 })).toBe('{"a":1,"b":{"x":2,"y":1}}');
  });

  it('preserves array order', () => {
    expect(canonicalize({ a: [3, 1, 2] })).toBe('{"a":[3,1,2]}');
  });

  it('drops undefined fields', () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('serializes nulls explicitly', () => {
    expect(canonicalize({ a: null })).toBe('{"a":null}');
  });

  it('produces identical output for equivalent inputs', () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });
});
