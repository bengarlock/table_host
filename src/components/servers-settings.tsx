"use client";

import { Check, LoaderCircle, Plus, Trash2, UsersRound } from "lucide-react";
import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { appPath } from "@/lib/app-paths";

type Server = { id: number; name: string; color: string };
type Section = { id: number; name: string; table_ids: number[] };
type Table = { id: number; name: string; capacity: number };

const SERVER_COLORS = ["#D95763", "#DB8A35", "#D3AD35", "#5B9C69", "#3C8FA8", "#6475C4", "#9960BC", "#B65A94"];

function readError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const first = Object.values(payload as Record<string, unknown>)[0];
  return Array.isArray(first) ? String(first[0]) : typeof first === "string" ? first : fallback;
}

async function request(path: string, options?: RequestInit) {
  const response = await fetch(appPath(path), options);
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(readError(payload, "Unable to save settings."));
  return payload;
}

export function ServersSettings() {
  const [servers, setServers] = useState<Server[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [serverName, setServerName] = useState("");
  const [serverColor, setServerColor] = useState(SERVER_COLORS[0]);
  const [sectionName, setSectionName] = useState("");
  const [sectionTableIds, setSectionTableIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "server" | "section"; id: number } | null>(null);

  async function loadSettings() {
    setLoading(true);
    setError("");
    try {
      const [serverData, sectionData, gridData] = await Promise.all([
        request("/api/settings/servers"),
        request("/api/settings/sections"),
        request("/api/grid"),
      ]);
      setServers(serverData as Server[]);
      setSections(sectionData as Section[]);
      setTables((gridData as { tables: Table[] }).tables);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load server settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSettings(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function addServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!serverName.trim() || saving) return;
    setSaving(true); setError("");
    try {
      const server = await request("/api/settings/servers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: serverName, color: serverColor }) }) as Server;
      setServers((current) => [...current, server].sort((a, b) => a.name.localeCompare(b.name)));
      setServerName("");
      setServerColor(SERVER_COLORS.find((color) => ![...servers, server].some((item) => item.color === color)) || SERVER_COLORS[0]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to add this server."); }
    finally { setSaving(false); }
  }

  async function addSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sectionName.trim() || saving) return;
    setSaving(true); setError("");
    try {
      const section = await request("/api/settings/sections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: sectionName, table_ids: sectionTableIds }) }) as Section;
      setSections((current) => [...current, section].sort((a, b) => a.name.localeCompare(b.name)));
      setSectionName(""); setSectionTableIds([]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to add this section."); }
    finally { setSaving(false); }
  }

  async function removeTarget() {
    if (!deleteTarget || saving) return;
    setSaving(true); setError("");
    try {
      await request(`/api/settings/${deleteTarget.kind === "server" ? "servers" : "sections"}/${deleteTarget.id}`, { method: "DELETE" });
      if (deleteTarget.kind === "server") setServers((current) => current.filter((item) => item.id !== deleteTarget.id));
      else setSections((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to remove this record."); }
    finally { setSaving(false); }
  }

  function toggleTable(id: number) {
    setSectionTableIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <section className="settings-section servers-settings" aria-labelledby="servers-settings-title">
      <header className="settings-section-header">
        <p>Service team</p>
        <h2 id="servers-settings-title">Servers</h2>
        <span>Create the server roster and reusable sections of the floor. Assign servers to sections for a shift on the floor plan.</span>
      </header>

      {error && <div className="settings-option-error" role="alert">{error}</div>}
      {loading ? <div className="servers-loading" role="status"><LoaderCircle className="spin" aria-hidden="true" /> Loading servers and sections…</div> : <div className="servers-settings-grid">
        <article className="servers-card">
          <div className="servers-card-heading"><UsersRound aria-hidden="true" /><div><h3>Server roster</h3><p>Each server has a distinct service color.</p></div></div>
          <form className="server-form" onSubmit={(event) => void addServer(event)}>
            <label><span>Name</span><input value={serverName} onChange={(event) => setServerName(event.target.value)} maxLength={80} placeholder="e.g. Jordan" required /></label>
            <fieldset className="server-color-picker"><legend>Color</legend><div>{SERVER_COLORS.map((color) => <button key={color} type="button" className={serverColor === color ? "selected" : ""} style={{ "--server-color": color } as CSSProperties} aria-label={`Choose ${color}`} aria-pressed={serverColor === color} onClick={() => setServerColor(color)}><Check aria-hidden="true" /></button>)}</div></fieldset>
            <button className="servers-add-button" type="submit" disabled={saving}><Plus aria-hidden="true" /> Add server</button>
          </form>
          <ul className="server-list" aria-label="Servers">{servers.map((server) => <li key={server.id}><span className="server-swatch" style={{ backgroundColor: server.color }} aria-hidden="true" /><span>{server.name}</span><button type="button" className={deleteTarget?.kind === "server" && deleteTarget.id === server.id ? "confirming" : ""} onClick={() => deleteTarget?.kind === "server" && deleteTarget.id === server.id ? void removeTarget() : setDeleteTarget({ kind: "server", id: server.id })}>{deleteTarget?.kind === "server" && deleteTarget.id === server.id ? "Confirm" : <><Trash2 aria-hidden="true" /> Remove</>}</button></li>)}</ul>
          {!servers.length && <p className="servers-empty">No servers yet. Add the first person on your team.</p>}
        </article>

        <article className="servers-card">
          <div className="servers-card-heading"><UsersRound aria-hidden="true" /><div><h3>Floor sections</h3><p>Group tables now; assign a server during each shift.</p></div></div>
          <form className="server-form" onSubmit={(event) => void addSection(event)}>
            <label><span>Section name</span><input value={sectionName} onChange={(event) => setSectionName(event.target.value)} maxLength={80} placeholder="e.g. Patio" required /></label>
            <fieldset className="section-table-picker"><legend>Tables in this section</legend>{tables.length ? <div>{tables.map((table) => <label key={table.id}><input type="checkbox" checked={sectionTableIds.includes(table.id)} onChange={() => toggleTable(table.id)} /><span>{table.name}</span></label>)}</div> : <p>Add tables to the floor plan before making a section.</p>}</fieldset>
            <button className="servers-add-button" type="submit" disabled={saving}><Plus aria-hidden="true" /> Add section</button>
          </form>
          <ul className="section-list" aria-label="Floor sections">{sections.map((section) => <li key={section.id}><div><strong>{section.name}</strong><span>{section.table_ids.length ? `${section.table_ids.length} ${section.table_ids.length === 1 ? "table" : "tables"}` : "No tables selected"}</span></div><button type="button" className={deleteTarget?.kind === "section" && deleteTarget.id === section.id ? "confirming" : ""} onClick={() => deleteTarget?.kind === "section" && deleteTarget.id === section.id ? void removeTarget() : setDeleteTarget({ kind: "section", id: section.id })}>{deleteTarget?.kind === "section" && deleteTarget.id === section.id ? "Confirm" : <><Trash2 aria-hidden="true" /> Remove</>}</button></li>)}</ul>
          {!sections.length && <p className="servers-empty">No sections yet. Choose one or more floor tables to define one.</p>}
        </article>
      </div>}
    </section>
  );
}
