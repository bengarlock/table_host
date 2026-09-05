"use client";

import { Check, LoaderCircle, Pencil, Plus, Trash2, UsersRound, X } from "lucide-react";
import { CSSProperties, FormEvent, useEffect, useRef, useState } from "react";
import { appPath } from "@/lib/app-paths";
import { connectedSectionOutlines } from "@/lib/section-outline";

type Server = { id: number; name: string; color: string };
type Section = { id: number; name: string; color: string; table_ids: number[] };
type Table = {
  id: number;
  name: string;
  capacity: number;
  shape: "rectangle" | "round";
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation: number;
  chair_layout: "wrap" | "across" | "across_horizontal";
  min_capacity: number;
};

const SERVER_COLORS = ["#D95763", "#DB8A35", "#D3AD35", "#5B9C69", "#3C8FA8", "#6475C4", "#9960BC", "#B65A94"];
const SECTION_COLORS = ["#D9AA62", "#5FA8D3", "#B174B8", "#65A97B", "#D3835E"];

function readError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const first = Object.values(payload as Record<string, unknown>)[0];
  return Array.isArray(first) ? String(first[0]) : typeof first === "string" ? first : fallback;
}

function chairPositions(table: Table): CSSProperties[] {
  if (table.shape === "round" && table.chair_layout === "wrap") {
    return Array.from({ length: table.capacity }, (_, index) => {
      const angle = -90 + (index * 360) / table.capacity;
      const radians = (angle * Math.PI) / 180;
      return { left: `${50 + Math.cos(radians) * 50}%`, top: `${50 + Math.sin(radians) * 50}%`, transform: `translate(-50%, -50%) rotate(${angle + 90}deg)` };
    });
  }
  const sides = table.chair_layout === "across"
    ? Array.from({ length: table.capacity }, (_, index) => index % 2 === 0 ? 0 : 2)
    : table.chair_layout === "across_horizontal"
      ? Array.from({ length: table.capacity }, (_, index) => index % 2 === 0 ? 1 : 3)
      : Array.from({ length: table.capacity }, (_, index) => index % 4);
  const totals = sides.reduce((counts, side) => { counts[side] += 1; return counts; }, [0, 0, 0, 0]);
  const placed = [0, 0, 0, 0];
  return sides.map((side) => {
    placed[side] += 1;
    const offset = `${(placed[side] / (totals[side] + 1)) * 100}%`;
    if (side === 0) return { left: offset, top: 0, transform: "translate(-50%, -50%)" };
    if (side === 1) return { left: "100%", top: offset, transform: "translate(-50%, -50%) rotate(90deg)" };
    if (side === 2) return { left: offset, top: "100%", transform: "translate(-50%, -50%) rotate(180deg)" };
    return { left: 0, top: offset, transform: "translate(-50%, -50%) rotate(270deg)" };
  });
}


function roundedOutlinePath(points: Array<{ x: number; y: number }>) {
  // Flush joins can repeat vertices. Remove zero-length edges before rounding,
  // otherwise their direction divides by zero and corrupts the SVG path.
  const distinct = points.filter((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    return point.x !== previous.x || point.y !== previous.y;
  });
  points = distinct.filter((point, index) => {
    const previous = distinct[(index + distinct.length - 1) % distinct.length];
    const next = distinct[(index + 1) % distinct.length];
    return (point.x - previous.x) * (next.y - point.y) !== (point.y - previous.y) * (next.x - point.x);
  });
  const distance = (first: { x: number; y: number }, second: { x: number; y: number }) => Math.hypot(second.x - first.x, second.y - first.y);
  const toward = (from: { x: number; y: number }, to: { x: number; y: number }, amount: number) => {
    const length = distance(from, to);
    if (!length) return from;
    return { x: from.x + (to.x - from.x) * amount / length, y: from.y + (to.y - from.y) * amount / length };
  };
  const corners = points.map((point, index) => {
    const previous = points[(index + points.length - 1) % points.length];
    const next = points[(index + 1) % points.length];
    const radius = Math.min(24, distance(point, previous) / 3, distance(point, next) / 3);
    return { point, entry: toward(point, previous, radius), exit: toward(point, next, radius) };
  });
  return corners.reduce((path, corner) => `${path} L ${corner.entry.x} ${corner.entry.y} Q ${corner.point.x} ${corner.point.y} ${corner.exit.x} ${corner.exit.y}`, `M ${corners[0].entry.x} ${corners[0].entry.y}`) + " Z";
}

function sectionOverlay(section: Section, tables: Table[], sections: Section[]) {
  const selected = tables.filter((table) => section.table_ids.includes(table.id));
  if (!selected.length) return null;
  const rows = selected.sort((first, second) => first.position_y - second.position_y).reduce<Table[][]>((groups, table) => {
    const row = groups.find((group) => Math.abs(group[0].position_y - table.position_y) < 10);
    if (row) row.push(table); else groups.push([table]);
    return groups;
  }, []);
  const bounds = rows.map((row) => {
    const padding = 25;
    const left = Math.min(...row.map((table) => 1200 * table.position_x / 100 - table.width / 2 - padding));
    const right = Math.max(...row.map((table) => 1200 * table.position_x / 100 + table.width / 2 + padding));
    const top = Math.min(...row.map((table) => 660 * table.position_y / 100 - table.height / 2 - padding));
    const bottom = Math.max(...row.map((table) => 660 * table.position_y / 100 + table.height / 2 + padding));
    return { left, right, top, bottom };
  });
  // Small differences in table widths should not create a step at a join.
  // Expand outward so smoothing never removes coverage from either row.
  if (bounds.length === 2) {
    const [upper, lower] = bounds;
    const overlap = Math.min(upper.right, lower.right) - Math.max(upper.left, lower.left);
    if (overlap > 0 && lower.top > upper.bottom) {
      if (Math.abs(upper.left - lower.left) <= 24) {
        upper.left = lower.left = Math.min(upper.left, lower.left);
      }
      if (Math.abs(upper.right - lower.right) <= 24) {
        upper.right = lower.right = Math.max(upper.right, lower.right);
      }
    }
  }
  const first = bounds[0];
  const obstacles = sections.filter((other) => other.id !== section.id).flatMap((other) => {
    const otherTables = tables.filter((table) => other.table_ids.includes(table.id));
    const groups: typeof otherTables[] = [];
    for (const table of [...otherTables].sort((a, b) => a.position_y - b.position_y)) {
      const group = groups.find((row) => Math.abs(row[0].position_y - table.position_y) < 10);
      if (group) group.push(table); else groups.push([table]);
    }
    const dimensions = { width: 1200, height: 660 };
    return groups.map((row) => ({
      left: Math.min(...row.map((table) => dimensions.width * table.position_x / 100 - table.width / 2 - 25)),
      right: Math.max(...row.map((table) => dimensions.width * table.position_x / 100 + table.width / 2 + 25)),
      top: Math.min(...row.map((table) => dimensions.height * table.position_y / 100 - table.height / 2 - 25)),
      bottom: Math.max(...row.map((table) => dimensions.height * table.position_y / 100 + table.height / 2 + 25)),
    }));
  });
  const joinedPaths = connectedSectionOutlines(bounds, obstacles).map(roundedOutlinePath);
  return { paths: joinedPaths, connectors: [] as string[], labelX: Math.max(14, first.left + 16), labelY: Math.max(26, first.top + 24), labelWidth: Math.max(74, section.name.length * 9 + 20) };
}

async function request(path: string, options?: RequestInit) {
  const response = await fetch(appPath(path), options);
  const payload = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(readError(payload, "Unable to save settings."));
  return payload;
}

export function ServersSettings() {
  const [activeTab, setActiveTab] = useState<"roster" | "sections">("roster");
  const [servers, setServers] = useState<Server[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [serverName, setServerName] = useState("");
  const [serverColor, setServerColor] = useState(SERVER_COLORS[0]);
  const [sectionName, setSectionName] = useState("");
  const [sectionColor, setSectionColor] = useState(SECTION_COLORS[0]);
  const [sectionTableIds, setSectionTableIds] = useState<number[]>([]);
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [creatingSection, setCreatingSection] = useState(false);
  const sectionActive = creatingSection || editingSectionId !== null;
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const floorRef = useRef<HTMLDivElement>(null);
  const [floorWidth, setFloorWidth] = useState(0);
  const [floorHeight, setFloorHeight] = useState(0);
  useEffect(() => {
    const element = floorRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setFloorWidth(entry.contentRect.width);
      setFloorHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loading, tables.length]);
  const floorBounds = tables.reduce((bounds, table) => {
    const radians = table.rotation * Math.PI / 180;
    const halfWidth = (Math.abs(Math.cos(radians)) * table.width + Math.abs(Math.sin(radians)) * table.height) / 2 + 40;
    const halfHeight = (Math.abs(Math.sin(radians)) * table.width + Math.abs(Math.cos(radians)) * table.height) / 2 + 40;
    const x = 1200 * table.position_x / 100;
    const y = 660 * table.position_y / 100;
    return { left: Math.min(bounds.left, x - halfWidth), right: Math.max(bounds.right, x + halfWidth),
      top: Math.min(bounds.top, y - halfHeight), bottom: Math.max(bounds.bottom, y + halfHeight) };
  }, { left: 0, right: 1200, top: 0, bottom: 660 });
  const floorScale = floorWidth > 24 && floorHeight > 24 ? Math.min(
    (floorWidth - 24) / (floorBounds.right - floorBounds.left),
    (floorHeight - 24) / (floorBounds.bottom - floorBounds.top),
  ) : 0;
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

  function clearSectionForm() {
    setCreatingSection(false);
    setSectionName("");
    setSectionColor(SECTION_COLORS[0]);
    setSectionTableIds([]);
    setEditingSectionId(null);
  }

  function editSection(section: Section) {
    setCreatingSection(false);
    setSectionName(section.name);
    setSectionColor(section.color || SECTION_COLORS[0]);
    setSectionTableIds(section.table_ids);
    setEditingSectionId(section.id);
    setDeleteTarget(null);
  }

  async function saveSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sectionActive || !sectionName.trim() || !sectionTableIds.length || saving) return;
    setSaving(true); setError("");
    try {
      const path = editingSectionId ? `/api/settings/sections/${editingSectionId}` : "/api/settings/sections";
      const section = await request(path, { method: editingSectionId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: sectionName, color: sectionColor, table_ids: sectionTableIds }) }) as Section;
      setSections((current) => [...current.filter((item) => item.id !== section.id), section].sort((a, b) => a.name.localeCompare(b.name)));
      clearSectionForm();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save this section."); }
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
    if (!sectionActive || saving) return;
    setSectionTableIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <section className="settings-section servers-settings" aria-label="Servers">
      <div className="servers-tabs" role="tablist" aria-label="Server settings">
        {([{ id: "roster", label: "Server roster" }, { id: "sections", label: "Floor sections" }] as const).map((tab) => (
          <button key={tab.id} id={`servers-tab-${tab.id}`} type="button" role="tab"
            aria-selected={activeTab === tab.id} aria-controls={`servers-panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "roster" : event.key === "End" ? "sections" : activeTab === "roster" ? "sections" : "roster";
              setActiveTab(next);
              document.getElementById(`servers-tab-${next}`)?.focus();
            }}>{tab.label}</button>
        ))}
      </div>
      {error && <div className="settings-option-error" role="alert">{error}</div>}
      {loading ? <div className="servers-loading" role="status"><LoaderCircle className="spin" aria-hidden="true" /> Loading servers and sections…</div> : <div className="servers-settings-grid">
        <article className="servers-card" role="tabpanel" id="servers-panel-roster" aria-labelledby="servers-tab-roster" hidden={activeTab !== "roster"}>
          <div className="servers-card-heading"><UsersRound aria-hidden="true" /><div><h3>Server roster</h3><p>Each server has a distinct service color.</p></div></div>
          <form className="server-form" onSubmit={(event) => void addServer(event)}>
            <label><span>Name</span><input value={serverName} onChange={(event) => setServerName(event.target.value)} maxLength={80} placeholder="e.g. Jordan" required /></label>
            <fieldset className="server-color-picker"><legend>Color</legend><div>{SERVER_COLORS.map((color) => <button key={color} type="button" className={serverColor === color ? "selected" : ""} style={{ "--server-color": color } as CSSProperties} aria-label={`Choose ${color}`} aria-pressed={serverColor === color} onClick={() => setServerColor(color)}><Check aria-hidden="true" /></button>)}</div></fieldset>
            <button className="servers-add-button" type="submit" disabled={saving}><Plus aria-hidden="true" /> Add server</button>
          </form>
          <ul className="server-list" aria-label="Servers">{servers.map((server) => <li key={server.id}><span className="server-swatch" style={{ backgroundColor: server.color }} aria-hidden="true" /><span>{server.name}</span><button type="button" className={deleteTarget?.kind === "server" && deleteTarget.id === server.id ? "confirming" : ""} onClick={() => deleteTarget?.kind === "server" && deleteTarget.id === server.id ? void removeTarget() : setDeleteTarget({ kind: "server", id: server.id })}>{deleteTarget?.kind === "server" && deleteTarget.id === server.id ? "Confirm" : <><Trash2 aria-hidden="true" /> Remove</>}</button></li>)}</ul>
          {!servers.length && <p className="servers-empty">No servers yet. Add the first person on your team.</p>}
        </article>

        <article className="servers-card" role="tabpanel" id="servers-panel-sections" aria-labelledby="servers-tab-sections" hidden={activeTab !== "sections"}>
          <div className="section-panel-heading">
          <div className="servers-card-heading"><UsersRound aria-hidden="true" /><div><h3>Floor sections</h3><p>Name a section, select its tables on the floor plan, then save it.</p></div></div>
            {sectionActive && <div className="section-form-actions"><button className="servers-add-button" type="submit" form="section-editor-form" disabled={saving || !sectionName.trim() || !sectionTableIds.length}>{editingSectionId ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}{editingSectionId ? "Save changes" : "Save section"}</button><button className="section-cancel-button" type="button" onClick={clearSectionForm} disabled={saving}><X aria-hidden="true" /> Cancel</button></div>}
          </div>
          <div className="section-editor-layout">
            <aside className="saved-sections-sidebar" aria-label="Saved sections">
              <h4>Saved sections</h4>
              <button className="servers-add-button section-new-button" type="button" disabled={saving || creatingSection} onClick={() => { clearSectionForm(); setCreatingSection(true); setError(""); }}><Plus aria-hidden="true" /> New section</button>
<ul className="section-list" aria-label="Floor sections">{creatingSection && <li className="is-selected"><label className="section-row-name"><span>New section name</span><input autoFocus form="section-editor-form" value={sectionName} onChange={(event) => setSectionName(event.target.value)} maxLength={80} placeholder="e.g. Section 1" required disabled={saving} /></label><span>{sectionTableIds.length} tables selected</span></li>}{sections.map((section) => <li key={section.id} className={editingSectionId === section.id ? "is-selected" : ""} onClick={(event) => { if (!(event.target as HTMLElement).closest("button, input, label")) editSection(section); }}><span className="section-swatch" style={{ backgroundColor: section.color || SECTION_COLORS[0] }} aria-hidden="true" />{editingSectionId === section.id ? <label className="section-row-name"><span>Section name</span><input autoFocus form="section-editor-form" value={sectionName} onChange={(event) => setSectionName(event.target.value)} maxLength={80} required disabled={saving} /></label> : <button className="section-row-select" type="button" aria-label={`Edit section ${section.name}`} aria-pressed={editingSectionId === section.id} onClick={() => editSection(section)}><strong>{section.name}</strong><span>{section.table_ids.length ? `${section.table_ids.length} ${section.table_ids.length === 1 ? "table" : "tables"}` : "No tables selected"}</span></button>}<div className="section-list-actions"><button type="button" onClick={() => editSection(section)}><Pencil aria-hidden="true" /> Edit</button><button type="button" className={deleteTarget?.kind === "section" && deleteTarget.id === section.id ? "confirming" : ""} onClick={() => deleteTarget?.kind === "section" && deleteTarget.id === section.id ? void removeTarget() : setDeleteTarget({ kind: "section", id: section.id })}>{deleteTarget?.kind === "section" && deleteTarget.id === section.id ? "Confirm" : <><Trash2 aria-hidden="true" /> Remove</>}</button></div></li>)}</ul>
{!sections.length && !creatingSection && <p className="servers-empty">No sections yet. Click New section to get started.</p>}
            </aside>
          <form id="section-editor-form" className="server-form" onSubmit={(event) => void saveSection(event)}>
            {sectionActive && <label className="section-color-field"><span>Section color</span><input type="color" value={sectionColor} onChange={(event) => setSectionColor(event.target.value.toUpperCase())} aria-label="Section color" /><output style={{ "--section-color": sectionColor } as CSSProperties}>{sectionColor}</output></label>}
            <fieldset className="section-floor-picker"><legend>Choose tables on the floor plan</legend>{tables.length ? <div ref={floorRef} className="section-floor-plan" aria-label="Floor plan table selection"><div className="section-floor-stage" style={{ transform: `translate(${(floorWidth - (floorBounds.right - floorBounds.left) * floorScale) / 2 - floorBounds.left * floorScale}px, ${12 - floorBounds.top * floorScale}px) scale(${floorScale})` }}>
              {sections.length > 0 && <svg className="floor-section-overlays" viewBox="0 0 1200 660" aria-label="Saved floor sections">{sections.map((section, index) => {
                const shape = sectionOverlay(section, tables, sections);
                const color = section.color || SECTION_COLORS[index % SECTION_COLORS.length];
                return shape && <g key={section.id} className="floor-section-overlay" style={{ "--section-color": color } as CSSProperties}>{shape.connectors.map((path, pathIndex) => <path key={pathIndex} className="floor-section-connector" d={path} />)}{shape.paths.map((path, pathIndex) => <path key={pathIndex} d={path} />)}<rect x={shape.labelX - 9} y={shape.labelY - 18} width={shape.labelWidth} height="24" rx="12" /><text x={shape.labelX} y={shape.labelY}>{section.name}</text></g>;
              })}</svg>}
              {tables.map((table) => {
              const selected = sectionTableIds.includes(table.id);
              return <button key={table.id} type="button" className={`floor-table floor-table-${table.shape} available${selected ? " seat-selected" : ""}`} style={{ left: `${table.position_x}%`, top: `${table.position_y}%`, width: `${table.width}px`, height: `${table.height}px`, "--table-rotation": `${table.rotation}deg`, "--table-label-rotation": `${-table.rotation}deg` } as CSSProperties} aria-pressed={selected} aria-label={`Table ${table.name}, ${table.capacity} seats${selected ? ", selected" : ""}`} onClick={() => toggleTable(table.id)}>
                {chairPositions(table).map((style, index) => <i key={index} className="chair" style={style} aria-hidden="true" />)}
                <span className="floor-table-surface" aria-hidden="true" />
                <span className={`floor-table-label${Math.min(table.width, table.height) < 64 ? " floor-table-label-compact" : ""}`}><strong>{table.name}</strong><small>{table.capacity} seats</small><em>Available</em></span>
              </button>;
              })}</div></div> : <p>Add tables to the floor plan before making a section.</p>}</fieldset>
            <p className="section-selection-status" role="status">{!sectionActive ? "Choose a saved section or click New section to select tables." : sectionTableIds.length ? `${sectionTableIds.length} ${sectionTableIds.length === 1 ? "table selected" : "tables selected"}` : "Select one or more tables for this section."}</p>
          </form>
          </div>
        </article>
      </div>}
    </section>
  );
}
