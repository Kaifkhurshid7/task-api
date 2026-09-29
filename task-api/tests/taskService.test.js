const taskService = require('../src/services/taskService');

const seed = (n) =>
  Array.from({ length: n }, (_, i) => taskService.create({ title: `task ${i + 1}` }));

beforeEach(() => taskService._reset());

describe('create', () => {
  test('applies defaults', () => {
    const task = taskService.create({ title: 'a' });
    expect(task).toMatchObject({
      title: 'a',
      description: '',
      status: 'todo',
      priority: 'medium',
      dueDate: null,
      completedAt: null,
    });
    expect(task.id).toEqual(expect.any(String));
    expect(new Date(task.createdAt).toString()).not.toBe('Invalid Date');
  });

  test('keeps provided fields and generates unique ids', () => {
    const a = taskService.create({ title: 'a', priority: 'high', status: 'in_progress' });
    const b = taskService.create({ title: 'b' });
    expect(a).toMatchObject({ priority: 'high', status: 'in_progress' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('getAll / findById', () => {
  test('getAll returns a copy, not the internal array', () => {
    seed(1);
    taskService.getAll().pop();
    expect(taskService.getAll()).toHaveLength(1);
  });

  test('findById returns the task or undefined', () => {
    const [t] = seed(1);
    expect(taskService.findById(t.id)).toEqual(t);
    expect(taskService.findById('nope')).toBeUndefined();
  });
});

describe('getByStatus', () => {
  test('returns only tasks with the exact status', () => {
    taskService.create({ title: 'a', status: 'todo' });
    taskService.create({ title: 'b', status: 'done' });
    const result = taskService.getByStatus('done');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('b');
  });

  test('returns empty array when nothing matches', () => {
    seed(2);
    expect(taskService.getByStatus('done')).toEqual([]);
  });

  test('does not match partial status strings', () => {
    seed(1);
    expect(taskService.getByStatus('to')).toEqual([]);
  });
});

describe('getPaginated', () => {
  test('page 1 returns the first items', () => {
    seed(5);
    expect(taskService.getPaginated(1, 2).map((t) => t.title)).toEqual(['task 1', 'task 2']);
  });

  test('later pages continue where the previous ended', () => {
    seed(5);
    expect(taskService.getPaginated(2, 2).map((t) => t.title)).toEqual(['task 3', 'task 4']);
    expect(taskService.getPaginated(3, 2).map((t) => t.title)).toEqual(['task 5']);
  });

  test('filters by status before paginating', () => {
    seed(3);
    taskService.create({ title: 'd', status: 'done' });
    expect(taskService.getPaginated(1, 2, 'done').map((t) => t.title)).toEqual(['d']);
    expect(taskService.getPaginated(2, 2, 'todo')).toHaveLength(1);
  });

  test('page past the end returns empty array', () => {
    seed(2);
    expect(taskService.getPaginated(5, 10)).toEqual([]);
  });
});

describe('getStats', () => {
  test('counts by status and overdue', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const future = new Date(Date.now() + 86400000).toISOString();
    taskService.create({ title: 'a', dueDate: past });
    taskService.create({ title: 'b', status: 'in_progress', dueDate: past });
    taskService.create({ title: 'c', status: 'done', dueDate: past }); // done is never overdue
    taskService.create({ title: 'd', dueDate: future });
    expect(taskService.getStats()).toEqual({ todo: 2, in_progress: 1, done: 1, overdue: 2 });
  });

  test('empty store gives zeros', () => {
    expect(taskService.getStats()).toEqual({ todo: 0, in_progress: 0, done: 0, overdue: 0 });
  });
});

describe('update', () => {
  test('merges fields and persists', () => {
    const [t] = seed(1);
    const updated = taskService.update(t.id, { title: 'new', priority: 'low' });
    expect(updated).toMatchObject({ id: t.id, title: 'new', priority: 'low' });
    expect(taskService.findById(t.id).title).toBe('new');
  });

  test('returns null for unknown id', () => {
    expect(taskService.update('nope', { title: 'x' })).toBeNull();
  });

  test('ignores non-updatable fields', () => {
    const [t] = seed(1);
    const updated = taskService.update(t.id, { id: 'hijacked', createdAt: 'x', foo: 'bar' });
    expect(updated).toEqual(t);
  });

  test('sets completedAt when moved to done and clears it when moved back', () => {
    const [t] = seed(1);
    expect(taskService.update(t.id, { status: 'done' }).completedAt).not.toBeNull();
    expect(taskService.update(t.id, { status: 'todo' }).completedAt).toBeNull();
  });
});

describe('remove', () => {
  test('removes an existing task', () => {
    const [t] = seed(1);
    expect(taskService.remove(t.id)).toBe(true);
    expect(taskService.getAll()).toEqual([]);
  });

  test('returns false for unknown id', () => {
    expect(taskService.remove('nope')).toBe(false);
  });
});

describe('completeTask', () => {
  test('marks done and sets completedAt', () => {
    const [t] = seed(1);
    const done = taskService.completeTask(t.id);
    expect(done.status).toBe('done');
    expect(new Date(done.completedAt).toString()).not.toBe('Invalid Date');
    expect(taskService.findById(t.id).status).toBe('done');
  });

  test('returns null for unknown id', () => {
    expect(taskService.completeTask('nope')).toBeNull();
  });

  test('keeps the original completedAt when completed twice', () => {
    const [t] = seed(1);
    const first = taskService.completeTask(t.id);
    expect(taskService.completeTask(t.id).completedAt).toBe(first.completedAt);
  });

  test('preserves priority', () => {
    const t = taskService.create({ title: 'a', priority: 'high' });
    expect(taskService.completeTask(t.id).priority).toBe('high');
  });
});

describe('assignTask', () => {
  test('stores the assignee', () => {
    const [t] = seed(1);
    const assigned = taskService.assignTask(t.id, 'Alice');
    expect(assigned.assignee).toBe('Alice');
    expect(taskService.findById(t.id).assignee).toBe('Alice');
  });

  test('replaces an existing assignee', () => {
    const [t] = seed(1);
    taskService.assignTask(t.id, 'Alice');
    expect(taskService.assignTask(t.id, 'Bob').assignee).toBe('Bob');
  });

  test('returns null for unknown id', () => {
    expect(taskService.assignTask('nope', 'Alice')).toBeNull();
  });
});
