'use client';

import { useMemo, useState } from 'react';

export interface Option {
  value: string;
  label: string;
  group?: string;
  /** Luôn được chọn, không bỏ được. */
  locked?: boolean;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Chọn…',
  emptyText = 'Không có mục nào',
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const lockedCount = options.filter((o) => o.locked).length;
  const chosen = new Set(selected);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = new Map<string, Option[]>();
    for (const o of options) {
      if (needle && !o.label.toLowerCase().includes(needle) &&
          !o.value.toLowerCase().includes(needle)) continue;
      const g = o.group ?? '';
      map.set(g, [...(map.get(g) ?? []), o]);
    }
    return [...map.entries()];
  }, [options, q]);

  function toggle(o: Option) {
    if (o.locked) return;
    onChange(chosen.has(o.value) ? selected.filter((v) => v !== o.value) : [...selected, o.value]);
  }

  const total = selected.length + lockedCount;

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', padding: '10px 13px', fontSize: 14, fontFamily: 'inherit',
          border: '1px solid var(--line-strong)', borderRadius: 'var(--r-sm)',
          background: 'var(--card)', color: 'var(--ink)', textAlign: 'left',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
        }}
      >
        <span>
          {total === 0 ? (
            <span style={{ color: 'var(--dim)' }}>{placeholder}</span>
          ) : (
            <>
              <b style={{ color: 'var(--acc-ink)' }}>{total}/{options.length}</b> đã chọn
              {lockedCount > 0 && (
                <span style={{ color: 'var(--dim)' }}> ({lockedCount} bắt buộc)</span>
              )}
            </>
          )}
        </span>
        <span style={{ color: 'var(--dim)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', zIndex: 10, top: 'calc(100% + 4px)', left: 0, right: 0,
            background: 'var(--card)', border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r-sm)', boxShadow: '0 8px 24px rgba(20,20,60,.10)',
            maxHeight: 280, overflowY: 'auto',
          }}
        >
          <div style={{ padding: 8, borderBottom: '1px solid var(--line)', position: 'sticky', top: 0, background: 'var(--card)' }}>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm…"
              style={{
                width: '100%', padding: '7px 10px', fontSize: 13, fontFamily: 'inherit',
                border: '1px solid var(--line)', borderRadius: 'var(--r-sm)',
                background: 'var(--card)', color: 'var(--ink)',
              }}
            />
          </div>

          {groups.length === 0 && <div className="empty" style={{ padding: 20 }}>{emptyText}</div>}

          {groups.map(([g, opts]) => (
            <div key={g}>
              {g && (
                <div style={{
                  fontSize: 10, textTransform: 'uppercase', letterSpacing: .6,
                  color: 'var(--dim)', padding: '8px 12px 4px', fontWeight: 500,
                }}>{g}</div>
              )}
              {opts.map((o) => {
                const on = o.locked || chosen.has(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o)}
                    disabled={o.locked}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                      padding: '7px 12px', border: 0, background: 'transparent',
                      fontFamily: 'inherit', fontSize: 13, textAlign: 'left',
                      cursor: o.locked ? 'default' : 'pointer',
                      color: o.locked ? 'var(--dim)' : 'var(--ink)',
                    }}
                  >
                    <span style={{
                      width: 15, height: 15, borderRadius: 4, flex: 'none',
                      border: `1px solid ${on ? 'var(--acc)' : 'var(--line-strong)'}`,
                      background: on ? 'var(--acc)' : 'transparent',
                      color: '#fff', fontSize: 10, display: 'grid', placeItems: 'center',
                    }}>{on ? '✓' : ''}</span>
                    <span style={{ flex: 1 }}>{o.label}</span>
                    {o.locked && <span style={{ fontSize: 10, color: 'var(--dim)' }}>bắt buộc</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
