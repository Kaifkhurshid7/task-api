const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

// Helper: POST a task, overriding defaults as needed.
const create = (body = {}) =>
  request(app).post('/tasks').send({ title: 'task', ...body });

beforeEach(() => taskService._reset());

describe('POST /tasks', () => {
  test('creates a task', async () => {
    const res = await create({ title: 'Write tests', priority: 'high' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Write tests', priority: 'high', status: 'todo' });
    expect(res.body.id).toBeDefined();
  });

  test.each([
    ['missing title', { title: undefined }],
    ['blank title', { title: '   ' }],
    ['non-string title', { title: 42 }],
    ['invalid status', { status: 'blocked' }],
    ['invalid priority', { priority: 'urgent' }],
    ['invalid dueDate', { dueDate: 'not-a-date' }],
    ['non-string dueDate', { dueDate: 5 }],
    ['empty status', { status: '' }],
  ])('400 on %s', async (_, body) => {
    const res = await create(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });
});

describe('GET /tasks', () => {
  test('lists all tasks', async () => {
    await create({ title: 'a' });
    await create({ title: 'b' });
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('filters by status', async () => {
    await create({ title: 'a' });
    await create({ title: 'b', status: 'done' });
    const res = await request(app).get('/tasks?status=done');
    expect(res.body.map((t) => t.title)).toEqual(['b']);
  });

  test('paginates', async () => {
    for (let i = 1; i <= 5; i++) await create({ title: `t${i}` });
    const p1 = await request(app).get('/tasks?page=1&limit=2');
    const p3 = await request(app).get('/tasks?page=3&limit=2');
    expect(p1.body.map((t) => t.title)).toEqual(['t1', 't2']);
    expect(p3.body.map((t) => t.title)).toEqual(['t5']);
  });

  test('defaults to page 1 / limit 10 when only one is given', async () => {
    for (let i = 1; i <= 12; i++) await create({ title: `t${i}` });
    const res = await request(app).get('/tasks?page=1');
    expect(res.body).toHaveLength(10);
    expect((await request(app).get('/tasks?limit=3')).body).toHaveLength(3);
  });

  test.each(['page=abc', 'page=0', 'page=-1', 'limit=0', 'limit=1.5', 'limit='])(
    '400 on invalid pagination (%s)',
    async (qs) => {
      const res = await request(app).get(`/tasks?${qs}`);
      expect(res.status).toBe(400);
    }
  );

  test('applies pagination together with status filter', async () => {
    for (let i = 0; i < 3; i++) await create();
    await create({ status: 'done' });
    const res = await request(app).get('/tasks?status=todo&page=1&limit=2');
    expect(res.body).toHaveLength(2);
    expect(res.body.every((t) => t.status === 'todo')).toBe(true);
  });

  test('status filter is exact, not a substring match', async () => {
    await create();
    expect((await request(app).get('/tasks?status=to')).body).toEqual([]);
  });
});

describe('PUT /tasks/:id', () => {
  test('updates a task', async () => {
    const { body: t } = await create();
    const res = await request(app).put(`/tasks/${t.id}`).send({ title: 'renamed', status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: t.id, title: 'renamed', status: 'in_progress' });
  });

  test('cannot change id or createdAt', async () => {
    const { body: t } = await create();
    const res = await request(app).put(`/tasks/${t.id}`).send({ id: 'x', createdAt: 'y' });
    expect(res.body).toMatchObject({ id: t.id, createdAt: t.createdAt });
  });

  test('404 for unknown id', async () => {
    const res = await request(app).put('/tasks/nope').send({ title: 'x' });
    expect(res.status).toBe(404);
  });

  test('400 on invalid body', async () => {
    const { body: t } = await create();
    const res = await request(app).put(`/tasks/${t.id}`).send({ title: '' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /tasks/:id', () => {
  test('deletes a task', async () => {
    const { body: t } = await create();
    const res = await request(app).delete(`/tasks/${t.id}`);
    expect(res.status).toBe(204);
    expect((await request(app).get('/tasks')).body).toEqual([]);
  });

  test('404 for unknown id', async () => {
    expect((await request(app).delete('/tasks/nope')).status).toBe(404);
  });
});

describe('PATCH /tasks/:id/complete', () => {
  test('completes a task', async () => {
    const { body: t } = await create();
    const res = await request(app).patch(`/tasks/${t.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.completedAt).not.toBeNull();
  });

  test('keeps priority', async () => {
    const { body: t } = await create({ priority: 'high' });
    const res = await request(app).patch(`/tasks/${t.id}/complete`);
    expect(res.body.priority).toBe('high');
  });

  test('404 for unknown id', async () => {
    expect((await request(app).patch('/tasks/nope/complete')).status).toBe(404);
  });
});

describe('GET /tasks/stats', () => {
  test('returns counts and overdue', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    await create({ dueDate: past });
    await create({ status: 'done' });
    const res = await request(app).get('/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ todo: 1, in_progress: 0, done: 1, overdue: 1 });
  });
});

describe('PATCH /tasks/:id/assign', () => {
  const assign = (id, body) => request(app).patch(`/tasks/${id}/assign`).send(body);

  test('assigns and returns the updated task', async () => {
    const { body: t } = await create();
    const res = await assign(t.id, { assignee: 'Alice' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: t.id, assignee: 'Alice' });
    const list = await request(app).get('/tasks');
    expect(list.body[0].assignee).toBe('Alice');
  });

  test('trims whitespace', async () => {
    const { body: t } = await create();
    expect((await assign(t.id, { assignee: '  Alice  ' })).body.assignee).toBe('Alice');
  });

  test('allows re-assigning to someone else', async () => {
    const { body: t } = await create();
    await assign(t.id, { assignee: 'Alice' });
    const res = await assign(t.id, { assignee: 'Bob' });
    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Bob');
  });

  test('404 for unknown task', async () => {
    expect((await assign('nope', { assignee: 'Alice' })).status).toBe(404);
  });

  test.each([
    ['empty string', { assignee: '' }],
    ['whitespace only', { assignee: '   ' }],
    ['missing', {}],
    ['non-string', { assignee: 123 }],
    ['too long', { assignee: 'x'.repeat(101) }],
  ])('400 on %s assignee', async (_, body) => {
    const { body: t } = await create();
    const res = await assign(t.id, body);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });

  test('validation runs before lookup (400 even for unknown id)', async () => {
    expect((await assign('nope', { assignee: '' })).status).toBe(400);
  });
});
