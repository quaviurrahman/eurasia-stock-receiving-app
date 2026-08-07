import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Plus, X, Trash2, Calculator } from "lucide-react";

export const fmt = (n) => {
  if (n == null || isNaN(n)) return "0";
  return Number.isInteger(n) ? String(n) : Number(n.toFixed(2)).toString();
};

const SlipCard = ({ index, slip, onUpdate, onRemove }) => {
  const [val, setVal] = useState("");
  const entries = slip.entries || [];
  const sum = entries.reduce((a, b) => a + (Number(b) || 0), 0);

  const addEntry = () => {
    const n = parseFloat(val);
    if (isNaN(n)) return;
    onUpdate({ ...slip, entries: [...entries, n] });
    setVal("");
  };
  const removeEntry = (k) => onUpdate({ ...slip, entries: entries.filter((_, j) => j !== k) });

  return (
    <div className="border border-border rounded-sm p-3" data-testid={`slip-card-${index}`}>
      <div className="flex items-center gap-2 mb-3">
        <Input
          value={slip.label || ""}
          onChange={(e) => onUpdate({ ...slip, label: e.target.value })}
          placeholder={`Slip ${index + 1} label (optional)`}
          className="h-10 rounded-sm"
          data-testid={`slip-label-${index}`}
        />
        <button
          type="button"
          onClick={onRemove}
          className="w-10 h-10 shrink-0 flex items-center justify-center text-destructive hover:bg-destructive/10 rounded-sm"
          data-testid={`remove-slip-${index}`}
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex gap-2">
        <Input
          type="number"
          inputMode="decimal"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addEntry();
            }
          }}
          placeholder="Enter a number…"
          className="h-11 rounded-sm tnum"
          data-testid={`slip-entry-input-${index}`}
        />
        <Button type="button" onClick={addEntry} className="h-11 rounded-sm bg-accent text-accent-foreground hover:bg-accent/90" data-testid={`slip-add-entry-${index}`}>
          <Plus size={16} />
        </Button>
      </div>

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {entries.map((n, k) => (
            <span key={k} className="inline-flex items-center gap-1 bg-secondary rounded-sm pl-2 pr-1 h-8 text-sm tnum" data-testid={`slip-entry-${index}-${k}`}>
              {fmt(n)}
              <button type="button" onClick={() => removeEntry(k)} className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:text-destructive" data-testid={`remove-entry-${index}-${k}`}>
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 pt-2 border-t border-border text-sm">
        <span className="text-muted-foreground">Count: <span className="text-foreground font-semibold tnum" data-testid={`slip-count-${index}`}>{entries.length}</span></span>
        <span className="text-muted-foreground">Sum: <span className="text-foreground font-semibold tnum" data-testid={`slip-sum-${index}`}>{fmt(sum)}</span></span>
      </div>
    </div>
  );
};

export const SlipsEditor = ({ slips, onChange }) => {
  const list = slips || [];
  const updateSlip = (i, s) => onChange(list.map((x, j) => (j === i ? s : x)));
  const removeSlip = (i) => onChange(list.filter((_, j) => j !== i));
  const addSlip = () => onChange([...list, { label: "", entries: [] }]);

  const allEntries = list.flatMap((s) => s.entries || []);
  const grandSum = allEntries.reduce((a, b) => a + (Number(b) || 0), 0);

  return (
    <div className="space-y-3">
      {list.map((s, i) => (
        <SlipCard key={i} index={i} slip={s} onUpdate={(v) => updateSlip(i, v)} onRemove={() => removeSlip(i)} />
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={addSlip} className="h-11 rounded-sm" data-testid="add-slip-btn">
          <Plus size={16} className="mr-2" /> Add slip
        </Button>
        {list.length > 0 && (
          <div className="flex items-center gap-2 text-sm" data-testid="slips-grand-total">
            <Calculator size={16} className="text-muted-foreground" />
            <span className="text-muted-foreground">Total entries:</span>
            <span className="font-semibold tnum">{allEntries.length}</span>
            <span className="text-muted-foreground ml-2">Grand sum:</span>
            <span className="font-semibold tnum">{fmt(grandSum)}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const SlipsView = ({ slips }) => {
  const list = slips || [];
  if (list.length === 0) return null;
  const allEntries = list.flatMap((s) => s.entries || []);
  const grandSum = allEntries.reduce((a, b) => a + (Number(b) || 0), 0);

  return (
    <div className="space-y-3" data-testid="slips-view">
      {list.map((s, i) => {
        const entries = s.entries || [];
        const sum = entries.reduce((a, b) => a + (Number(b) || 0), 0);
        return (
          <div key={i} className="border border-border rounded-sm p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-sm">{s.label || `Slip ${i + 1}`}</span>
              <span className="text-sm text-muted-foreground tnum">
                Count: <span className="text-foreground font-semibold">{entries.length}</span> · Sum:{" "}
                <span className="text-foreground font-semibold">{fmt(sum)}</span>
              </span>
            </div>
            <div className="text-sm tnum text-muted-foreground break-words">
              {entries.length ? entries.map(fmt).join(",  ") : "No entries"}
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-end gap-2 text-sm">
        <span className="text-muted-foreground">Grand total —</span>
        <span className="text-muted-foreground">entries:</span>
        <span className="font-semibold tnum">{allEntries.length}</span>
        <span className="text-muted-foreground ml-2">sum:</span>
        <span className="font-semibold tnum">{fmt(grandSum)}</span>
      </div>
    </div>
  );
};
