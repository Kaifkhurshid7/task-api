const { v4: uuidv4 } = require('uuid');

// In-memory store: data is lost on restart (no database by design).
let tasks = [];

const getAll = () => [...tasks];

const findById = (id) => tasks.find((t) => t.id === id);

// Exact match only. (BUG-2: previously used String.includes, so 'to' matched 'todo'.)
const getByStatus = (status) => tasks.filter((t) => t.status === status);

// Pages are 1-based; the optional status filter is applied before slicing.
// (BUG-1: offset was page * limit. BUG-5: status filter used to bypass pagination.)
const getPaginated = (page, limit, status) => {
  const source = status ? getByStatus(status) : tasks;
  const offset = (page - 1) * limit;
  return source.slice(offset, offset + limit);
};

const getStats = () => {
  const now = new Date();
  const counts = { todo: 0, in_progress: 0, done: 0 };
  let overdue = 0;

  tasks.forEach((t) => {
    if (counts[t.status] !== undefined) counts[t.status]++;
    if (t.dueDate && t.status !== 'done' && new Date(t.dueDate) < now) {
      overdue++;
    }
  });

  return { ...counts, overdue };
};

const create = ({ title, description = '', status = 'todo', priority = 'medium', dueDate = null }) => {
  const task = {
    id: uuidv4(),
    title,
    description,
    status,
    priority,
    dueDate,
    completedAt: null,
    createdAt: new Date().toISOString(),
  };
  tasks.push(task);
  return task;
};

// Whitelist so clients cannot overwrite id/createdAt/completedAt. (BUG-4: mass assignment)
const UPDATABLE_FIELDS = ['title', 'description', 'status', 'priority', 'dueDate'];

const update = (id, fields) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const current = tasks[index];
  const changes = {};
  UPDATABLE_FIELDS.forEach((key) => {
    if (fields[key] !== undefined) changes[key] = fields[key];
  });

  const updated = { ...current, ...changes };
  // Keep completedAt consistent with status. (BUG-7)
  if (changes.status === 'done' && !current.completedAt) {
    updated.completedAt = new Date().toISOString();
  } else if (changes.status && changes.status !== 'done') {
    updated.completedAt = null;
  }
  tasks[index] = updated;
  return updated;
};

const remove = (id) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return false;

  tasks.splice(index, 1);
  return true;
};

// Only status/completedAt change. (BUG-3: priority used to be reset to 'medium'.)
// Completing twice keeps the original completedAt.
const completeTask = (id) => {
  const task = findById(id);
  if (!task) return null;

  const updated = {
    ...task,
    status: 'done',
    completedAt: task.completedAt || new Date().toISOString(),
  };

  const index = tasks.findIndex((t) => t.id === id);
  tasks[index] = updated;
  return updated;
};

// Re-assigning an already assigned task simply replaces the assignee.
const assignTask = (id, assignee) => {
  const index = tasks.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const updated = { ...tasks[index], assignee };
  tasks[index] = updated;
  return updated;
};

const _reset = () => {
  tasks = [];
};

module.exports = {
  getAll,
  findById,
  getByStatus,
  getPaginated,
  getStats,
  create,
  update,
  remove,
  completeTask,
  assignTask,
  _reset,
};
