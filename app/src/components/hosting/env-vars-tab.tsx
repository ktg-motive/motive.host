'use client';

import { useState, useEffect, useCallback } from 'react';
import Card from '@/components/ui/card';

interface EnvVar {
  id: string;
  key: string;
  value: string;
  is_secret: boolean;
  updated_at: string;
}

interface EnvVarsTabProps {
  appSlug: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EnvVarsTab({ appSlug }: EnvVarsTabProps) {
  const [vars, setVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New var form
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newIsSecret, setNewIsSecret] = useState(false);
  const [addState, setAddState] = useState<{
    loading: boolean;
    message: string | null;
    error: string | null;
  }>({ loading: false, message: null, error: null });

  // Edit state
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editState, setEditState] = useState<{
    loading: boolean;
    error: string | null;
  }>({ loading: false, error: null });

  // Delete state
  const [deleteState, setDeleteState] = useState<{
    loading: string | null;
  }>({ loading: null });

  const fetchVars = useCallback(async () => {
    try {
      const res = await fetch(`/api/hosting/${appSlug}/env`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to fetch environment variables');
        return;
      }
      const data = await res.json();
      setVars(data.vars ?? []);
      setError(null);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [appSlug]);

  useEffect(() => {
    fetchVars();
  }, [fetchVars]);

  async function handleAdd() {
    if (!newKey.trim()) {
      setAddState({ loading: false, message: null, error: 'Key is required' });
      return;
    }
    setAddState({ loading: true, message: null, error: null });
    try {
      const res = await fetch(`/api/hosting/${appSlug}/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vars: [{ key: newKey.trim(), value: newValue, is_secret: newIsSecret }],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddState({ loading: false, message: null, error: data.error ?? 'Failed to add variable' });
      } else {
        setAddState({
          loading: false,
          message: data.env_file_updated
            ? 'Variable added. .env file updated on server.'
            : 'Variable added.' + (data.warning ? ` Warning: ${data.warning}` : ''),
          error: null,
        });
        setNewKey('');
        setNewValue('');
        setNewIsSecret(false);
        fetchVars();
      }
    } catch {
      setAddState({ loading: false, message: null, error: 'Network error' });
    }
  }

  async function handleEdit(key: string) {
    if (!editValue && editValue !== '') return;
    setEditState({ loading: true, error: null });
    try {
      const existingVar = vars.find(v => v.key === key);
      const res = await fetch(`/api/hosting/${appSlug}/env`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vars: [{ key, value: editValue, is_secret: existingVar?.is_secret ?? false }],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditState({ loading: false, error: data.error ?? 'Failed to update variable' });
      } else {
        setEditState({ loading: false, error: null });
        setEditingKey(null);
        setEditValue('');
        fetchVars();
      }
    } catch {
      setEditState({ loading: false, error: 'Network error' });
    }
  }

  async function handleDelete(key: string) {
    if (!window.confirm(`Delete environment variable "${key}"? This cannot be undone.`)) return;
    setDeleteState({ loading: key });
    try {
      const res = await fetch(`/api/hosting/${appSlug}/env`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: [key] }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? 'Failed to delete variable');
      } else {
        fetchVars();
      }
    } catch {
      alert('Network error');
    } finally {
      setDeleteState({ loading: null });
    }
  }

  if (loading) {
    return (
      <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          Environment Variables
        </h2>
        <p className="text-sm text-slate">Loading...</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          Environment Variables
        </h2>
        <p className="text-sm text-red-400">{error}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Redeploy warning */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <p className="text-sm text-amber-400">
          Environment variable changes require a redeploy to take effect. After making changes, deploy your app from the Deployment tab.
        </p>
      </div>

      {/* Current variables */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          Environment Variables
        </h2>

        {vars.length === 0 ? (
          <p className="text-sm text-slate">No environment variables configured.</p>
        ) : (
          <div className="divide-y divide-border">
            {vars.map((v) => (
              <div key={v.key} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-sm font-medium text-muted-white">{v.key}</code>
                      {v.is_secret && (
                        <span className="inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
                          Secret
                        </span>
                      )}
                    </div>
                    {editingKey === v.key ? (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          placeholder={v.is_secret ? 'Enter new value' : v.value}
                          className="flex-1 rounded-lg border border-border bg-primary-bg px-3 py-1.5 font-mono text-sm text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => handleEdit(v.key)}
                          disabled={editState.loading}
                          className="rounded-lg border border-gold px-3 py-1.5 text-xs text-gold transition-colors hover:bg-gold hover:text-primary-bg disabled:opacity-50"
                        >
                          {editState.loading ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => { setEditingKey(null); setEditValue(''); setEditState({ loading: false, error: null }); }}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs text-slate transition-colors hover:border-gold hover:text-muted-white"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <p className="mt-0.5 font-mono text-xs text-slate">
                        {v.value}
                      </p>
                    )}
                    {editingKey === v.key && editState.error && (
                      <p className="mt-1 text-xs text-red-400">{editState.error}</p>
                    )}
                  </div>

                  {editingKey !== v.key && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => { setEditingKey(v.key); setEditValue(''); setEditState({ loading: false, error: null }); }}
                        className="rounded border border-border px-2 py-1 text-xs text-slate transition-colors hover:border-gold hover:text-muted-white"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(v.key)}
                        disabled={deleteState.loading === v.key}
                        className="rounded border border-border px-2 py-1 text-xs text-slate transition-colors hover:border-red-400/50 hover:text-red-400 disabled:opacity-50"
                      >
                        {deleteState.loading === v.key ? '...' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate/60">
                  Updated {formatDate(v.updated_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add new variable */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-muted-white">
          Add Variable
        </h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate">
              Key
            </label>
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase())}
              placeholder="MY_VARIABLE"
              className="w-full rounded-lg border border-border bg-primary-bg px-3 py-2 font-mono text-sm text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate">
              Value
            </label>
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="value"
              className="w-full rounded-lg border border-border bg-primary-bg px-3 py-2 font-mono text-sm text-muted-white placeholder:text-slate/50 focus:border-gold focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNewIsSecret(!newIsSecret)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                newIsSecret ? 'bg-gold' : 'bg-border'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                  newIsSecret ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="text-sm text-slate">Secret (value will be masked)</span>
          </div>

          <button
            onClick={handleAdd}
            disabled={addState.loading || !newKey.trim()}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-primary-bg transition-colors hover:bg-gold-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {addState.loading ? 'Adding...' : 'Add Variable'}
          </button>

          {addState.message && (
            <p className="text-sm text-green-400">{addState.message}</p>
          )}
          {addState.error && (
            <p className="text-sm text-red-400">{addState.error}</p>
          )}
        </div>
      </Card>
    </div>
  );
}
