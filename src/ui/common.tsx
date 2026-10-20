import { useEffect, useRef, useState } from "react";

/** Anything that deletes stored data asks you to type "delete" first, like GitHub. Resolves true only then. */
let askDelete: ((what: string) => Promise<boolean>) | null = null;

export const confirmDelete = (what: string): Promise<boolean> => (askDelete ? askDelete(what) : Promise.resolve(window.confirm(what)));

export function DeleteDialog() {
  const [req, setReq] = useState<{ what: string; done: (ok: boolean) => void } | null>(null);
  const [typed, setTyped] = useState("");
  useEffect(() => { askDelete = (what) => new Promise((done) => { setTyped(""); setReq({ what, done }); }); return () => { askDelete = null; }; }, []);
  if (!req) return null;
  const close = (ok: boolean) => { req.done(ok); setReq(null); };
  const ready = typed.trim().toLowerCase() === "delete";
  return (
    <div className="modal-back" onClick={() => close(false)}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <b>Are you sure?</b>
        <p>{req.what}</p>
        <label>Type <b>delete</b> to confirm</label>
        <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && ready) close(true); if (e.key === "Escape") close(false); }} />
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button className="ghost" onClick={() => close(false)}>Cancel</button>
          <button className="danger" disabled={!ready} onClick={() => close(true)}>Delete</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Progress bar for the scrapers. With `done`/`total` it fills and shows "done of total (n%)"; without, it creeps
 * toward 90% over about `expectMs` (an estimate) so a single page read still shows movement.
 */
export function Progress({ done, total, label, expectMs = 8000 }: { done?: number; total?: number; label?: string; expectMs?: number }) {
  const [t0] = useState(() => Date.now());
  const [, tick] = useState(0);
  const known = !!total && total > 0;
  useEffect(() => { if (known) return; const iv = window.setInterval(() => tick((n) => n + 1), 250); return () => window.clearInterval(iv); }, [known]);
  const frac = known ? Math.min((done || 0) / total!, 1) : 0.9 * (1 - Math.exp(-(Date.now() - t0) / (expectMs / 2)));
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
      <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.max(frac * 100, 2)}%` }} /></div>
      <div className="small muted">{label ? `${label} · ` : ""}{known ? `${Math.floor(done || 0)} of ${total} (${Math.round(frac * 100)}%)` : `about ${Math.round(frac * 100)}%`}</div>
    </div>
  );
}

/** Trash-can icon for delete buttons. */
export const Trash = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
  </svg>
);

/* ---------------- Search (LinkedIn / Indeed) ---------------- */

/** Chip list with an inline "add" box. */
export function ChipInput({ items, onAdd, onRemove, placeholder }: { items: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void; placeholder: string }) {
  const [v, setV] = useState("");
  const add = () => { const t = v.trim(); if (t) onAdd(t); setV(""); };
  return (
    <div className="chips">
      {items.map((it) => <span key={it} className="chip">{it} <button className="chip-x" onClick={() => onRemove(it)} title="Remove">×</button></span>)}
      <input className="chip-input" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} onBlur={add} />
    </div>
  );
}

/** Move one item of a list from index `from` to index `to`. */
export const arrayMove = <T,>(list: T[], from: number, to: number): T[] => { const out = [...list]; const [x] = out.splice(from, 1); out.splice(to, 0, x); return out; };

/**
 * Drag to reorder with a grip handle. Uses pointer events so it works with a mouse and on touch screens; the item
 * moves as soon as the pointer passes the middle of a neighbour. Arrow keys on the handle also move it (keyboard).
 */
export function useDragSort(count: number, move: (from: number, to: number) => void) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const cur = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const end = () => { cur.current = null; setDragging(null); };
  const handle = (i: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => { e.preventDefault(); e.stopPropagation(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* keeps working without capture */ } cur.current = i; setDragging(i); },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const from = cur.current;
      if (from === null) return;
      const y = e.clientY;
      // Keep the page scrolling while dragging near the top or bottom edge.
      const scroller = document.querySelector("main");
      if (scroller) { if (y < 70) scroller.scrollBy(0, -12); else if (y > window.innerHeight - 70) scroller.scrollBy(0, 12); }
      let to = from;
      refs.current.slice(0, count).forEach((el, k) => {
        if (!el || k === from) return;
        const r = el.getBoundingClientRect();
        const mid = r.top + Math.min(r.height, 44) / 2; // compare with the title line, not an opened entry's full height
        if (k < from && y < mid) to = Math.min(to, k);
        if (k > from && y > mid) to = Math.max(to, k);
      });
      if (to !== from) { move(from, to); cur.current = to; setDragging(to); }
    },
    onPointerUp: end,
    onPointerCancel: end,
    onClick: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); }, // don't open/close the entry
    onKeyDown: (e: React.KeyboardEvent) => {
      const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : -1;
      if (to < 0 || to >= count) return;
      e.preventDefault(); e.stopPropagation(); move(i, to);
      window.setTimeout(() => (refs.current[to]?.querySelector(".drag-handle") as HTMLElement | null)?.focus(), 0);
    },
  });
  return { ref: (i: number) => (el: HTMLElement | null) => { refs.current[i] = el; }, handle, dragging };
}

/** The grip you drag by. */
export function DragHandle(props: ReturnType<ReturnType<typeof useDragSort>["handle"]> & { label: string }) {
  const { label, ...rest } = props;
  return <button type="button" className="drag-handle" title="Drag to reorder (or use the arrow keys)" aria-label={label} {...rest}>⠿</button>;
}
