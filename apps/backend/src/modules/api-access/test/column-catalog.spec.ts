import { API_ACCESS_CATALOG, isValidScope } from '../column-catalog';

describe('API_ACCESS_CATALOG', () => {
  it('has a non-empty column list for every entity', () => {
    for (const columns of Object.values(API_ACCESS_CATALOG)) {
      expect(Array.isArray(columns)).toBe(true);
      expect(columns.length).toBeGreaterThan(0);
    }
  });

  it('includes all 7 confirmed entities', () => {
    expect(Object.keys(API_ACCESS_CATALOG).sort()).toEqual(
      ['Activity', 'CareGiver', 'CarePlanItem', 'Diagnosis', 'DoctorSchedule', 'Patient', 'Prescription'].sort(),
    );
  });
});

describe('isValidScope', () => {
  it('accepts a scope using only catalog entities and columns', () => {
    expect(isValidScope({ Patient: ['hn', 'age'] })).toBe(true);
  });

  it('rejects a scope with an unknown entity', () => {
    expect(isValidScope({ NotAModel: ['x'] })).toBe(false);
  });

  it('rejects a scope with an unknown column on a known entity', () => {
    expect(isValidScope({ Patient: ['hn', 'notAColumn'] })).toBe(false);
  });

  it('rejects an empty scope', () => {
    expect(isValidScope({})).toBe(false);
  });

  it('rejects a scope where an entity has an empty column list', () => {
    expect(isValidScope({ Patient: [] })).toBe(false);
  });
});
