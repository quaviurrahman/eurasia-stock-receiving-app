import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { DatabaseBackup, Download, Upload } from "lucide-react";

export const BackupPanel = () => {
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);

  const download = async () => {
    setBusy("backup");
    try {
      const res = await api.get("/admin/backup", { responseType: "blob", timeout: 0 });
      const name = (res.headers["content-disposition"] || "").match(/filename="?([^"]+)"?/)?.[1] || "eurasia-backup.zip";
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded");
    } catch {
      toast.error("Backup failed");
    } finally {
      setBusy("");
    }
  };

  const restore = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const typed = window.prompt(`This REPLACES all data on this server with "${file.name}". Type RESTORE to continue.`);
    if (typed !== "RESTORE") return;
    setBusy("restore");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/admin/restore", fd, { timeout: 0 });
      const total = Object.values(data.collections).reduce((a, b) => a + b, 0);
      toast.success(`Restored ${total} records and ${data.files} files. Please sign in again.`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Restore failed");
    } finally {
      setBusy("");
    }
  };

  return (
    <Card className="rounded-sm border-border p-5" data-testid="backup-panel">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-secondary rounded-sm flex items-center justify-center">
          <DatabaseBackup size={20} />
        </div>
        <div>
          <h3 className="font-head font-bold text-lg">Full backup & restore</h3>
          <p className="text-sm text-muted-foreground">
            One zip with every record plus photos and signatures. Use it to move data to your local server.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={download} disabled={!!busy} className="h-11 rounded-sm" data-testid="backup-download-btn">
          <Download size={16} className="mr-2" /> {busy === "backup" ? "Preparing…" : "Download full backup"}
        </Button>
        <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={restore} data-testid="backup-restore-input" />
        <Button onClick={() => fileRef.current?.click()} disabled={!!busy} className="h-11 rounded-sm bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="backup-restore-btn">
          <Upload size={16} className="mr-2" /> {busy === "restore" ? "Restoring…" : "Restore from backup"}
        </Button>
      </div>
    </Card>
  );
};
