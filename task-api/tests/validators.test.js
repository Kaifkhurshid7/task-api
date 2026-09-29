const { validateCreateTask, validateUpdateTask, validateAssignTask, validatePagination } = require('../src/utils/validators');

describe('validateCreateTask', () => {
  test('accepts a minimal and a full body', () => {
    expect(validateCreateTask({ title: 'a' })).toBeNull();
    expect(
      validateCreateTask({ title: 'a', status: 'done', priority: 'low', dueDate: '2030-01-01T00:00:00Z' })
    ).toBeNull();
  });

  test.each([{}, { title: '' }, { title: '  ' }, { title: 1 }])('rejects bad title %j', (body) => {
    expect(validateCreateTask(body)).toMatch(/title/);
  });

  test('rejects bad status, priority, dueDate', () => {
    expect(validateCreateTask({ title: 'a', status: 'x' })).toMatch(/status/);
    expect(validateCreateTask({ title: 'a', priority: 'x' })).toMatch(/priority/);
    expect(validateCreateTask({ title: 'a', dueDate: 'x' })).toMatch(/dueDate/);
  });
});

describe('validateUpdateTask', () => {
  test('accepts empty and partial bodies', () => {
    expect(validateUpdateTask({})).toBeNull();
    expect(validateUpdateTask({ status: 'done' })).toBeNull();
  });

  test('rejects invalid fields', () => {
    expect(validateUpdateTask({ title: '' })).toMatch(/title/);
    expect(validateUpdateTask({ title: 5 })).toMatch(/title/);
    expect(validateUpdateTask({ status: 'x' })).toMatch(/status/);
    expect(validateUpdateTask({ priority: 'x' })).toMatch(/priority/);
    expect(validateUpdateTask({ dueDate: 'x' })).toMatch(/dueDate/);
  });
});

describe('validateAssignTask', () => {
  test('accepts a name', () => {
    expect(validateAssignTask({ assignee: 'Alice' })).toBeNull();
  });

  test.each([undefined, null, {}, { assignee: '' }, { assignee: ' ' }, { assignee: 1 }])(
    'rejects %j',
    (body) => {
      expect(validateAssignTask(body)).toMatch(/assignee/);
    }
  );
});

describe('validatePagination', () => {
  test('accepts absent and positive integer values', () => {
    expect(validatePagination({})).toBeNull();
    expect(validatePagination({ page: '2', limit: '5' })).toBeNull();
  });

  test.each([{ page: '0' }, { page: '-1' }, { page: 'a' }, { limit: '1.5' }, { limit: '' }])(
    'rejects %j',
    (q) => {
      expect(validatePagination(q)).toMatch(/positive integer/);
    }
  );
});
