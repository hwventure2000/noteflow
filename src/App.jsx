import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const uid = () => Math.random().toString(36).slice(2, 9);
const nowTs = () => Date.now();
const fmt = (ts) => new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const FIXED_TABS = [
  { id: "all", label: "All Notes", fixed: true },
  { id: "uncategorized", label: "Uncategorized", fixed: true },
];

const T = {
  dark: { bg: "#0d0d12", sidebar: "#13131a", card: "#1a1a24", cardHover: "#21212e", border: "#272736", text: "#e6e3f3", muted: "#736f92", accent: "#7c6af7", accentSoft: "#1e1a38", danger: "#ef4444", success: "#4a7a5a", input: "#111119", inputBorder: "#2a2a3c", tag: "#22223a", tagText: "#9d98cc" },
  light: { bg: "#f2f1f8", sidebar: "#ffffff", card: "#ffffff", cardHover: "#f7f5ff", border: "#e0ddf0", text: "#1c1829", muted: "#8a87aa", accent: "#6c5ce7", accentSoft: "#ede9ff", danger: "#dc2626", success: "#6b8f72", input: "#f7f5ff", inputBorder: "#d8d4f0", tag: "#ede9ff", tagText: "#6c5ce7" },
};

function Ico({ d, size = 15, fill = "none", sw = 1.9 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}
function Star({ filled, size = 15, onClick }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "#f59e0b" : "none"} stroke={filled ? "#f59e0b" : "currentColor"} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" onClick={onClick} style={{ cursor: "pointer", flexShrink: 0 }}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

async function ocrWithClaude(base64, mediaType) {
  const prompt = `Look at this image carefully. It may contain handwritten or typed text — either a single note/thought, or multiple distinct notes/items on a page.
If it contains ONE note or idea, return: {"type":"single","title":"brief title","body":"full extracted text"}
If it contains MULTIPLE distinct notes or items, return: {"type":"multi","notes":[{"title":"title","body":"text"},...]}`  ;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 1500,
        messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }, { type: "text", text: prompt }] }],
      }),
    });
    const data = await res.json();
    const text = data.content?.find(b => b.type === "text")?.text || "";
    return JSON.parse(text.replace(/```json|```/g, "").trim());
  } catch { return null; }
}

// ── Chime sound via Web Audio API ─────────────────────────────────────────────
function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.28, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.5);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  } catch (e) { /* silently fail if audio not available */ }
}

let _dragNoteId = null;

// ── Auth Screen ───────────────────────────────────────────────────────────────
function AuthScreen({ c, s }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handle = async () => {
    setLoading(true); setError(""); setMessage("");
    if (mode === "login") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else if (mode === "signup") {
      const { error } = await sb.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMessage("Check your email to confirm your account, then log in.");
    } else {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (error) setError(error.message);
      else setMessage("Password reset email sent!");
    }
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", position: "fixed", top: 0, left: 0, background: c.bg, alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans','Segoe UI',sans-serif" }}>
      <div style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 20, padding: 36, width: "100%", maxWidth: 380 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: c.accent, letterSpacing: "-0.5px", marginBottom: 4 }}>📋 NoteFlow</div>
        <div style={{ fontSize: 13, color: c.muted, marginBottom: 28 }}>
          {mode === "login" ? "Sign in to your workspace" : mode === "signup" ? "Create your account" : "Reset your password"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input style={s.inp} placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} />
          {mode !== "reset" && <input style={s.inp} placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handle()} />}
          {error && <div style={{ fontSize: 12.5, color: c.danger }}>{error}</div>}
          {message && <div style={{ fontSize: 12.5, color: c.success }}>{message}</div>}
          <button style={{ ...s.btn("primary"), justifyContent: "center", padding: "10px" }} onClick={handle} disabled={loading}>
            {loading ? "…" : mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Email"}
          </button>
        </div>
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          {mode === "login" && <>
            <span style={{ fontSize: 12.5, color: c.muted, cursor: "pointer" }} onClick={() => setMode("signup")}>Don't have an account? <span style={{ color: c.accent }}>Sign up</span></span>
            <span style={{ fontSize: 12.5, color: c.muted, cursor: "pointer" }} onClick={() => setMode("reset")}><span style={{ color: c.accent }}>Forgot password?</span></span>
          </>}
          {mode !== "login" && <span style={{ fontSize: 12.5, color: c.muted, cursor: "pointer" }} onClick={() => setMode("login")}>Back to <span style={{ color: c.accent }}>sign in</span></span>}
        </div>
      </div>
    </div>
  );
}

// ── Reminder Picker ───────────────────────────────────────────────────────────
function ReminderPicker({ value, onChange, s, c }) {
  // value is ISO string like "2025-06-15T14:30" or ""
  const parse = (v) => {
    if (!v) return { date: "", hour: "12", minute: "00", ampm: "AM" };
    const d = new Date(v);
    if (isNaN(d)) return { date: "", hour: "12", minute: "00", ampm: "AM" };
    const h24 = d.getHours();
    const ampm = h24 >= 12 ? "PM" : "AM";
    const hour = String(h24 % 12 === 0 ? 12 : h24 % 12);
    const minute = String(d.getMinutes()).padStart(2, "0");
    const date = v.slice(0, 10);
    return { date, hour, minute, ampm };
  };

  const { date, hour, minute, ampm } = parse(value);

  const emit = (d, h, m, ap) => {
    if (!d) { onChange(""); return; }
    let h24 = parseInt(h, 10) % 12;
    if (ap === "PM") h24 += 12;
    const pad = (n) => String(n).padStart(2, "0");
    onChange(`${d}T${pad(h24)}:${m}`);
  };

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
  const minutes = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input
        type="date"
        style={{ ...s.inp, flex: "1 1 130px", minWidth: 130 }}
        value={date}
        onChange={e => emit(e.target.value, hour, minute, ampm)}
      />
      <select
        style={{ ...s.inp, width: 70 }}
        value={hour}
        onChange={e => emit(date, e.target.value, minute, ampm)}
      >
        {hours.map(h => <option key={h} value={h}>{h}</option>)}
      </select>
      <span style={{ color: c.muted, fontWeight: 700 }}>:</span>
      <select
        style={{ ...s.inp, width: 70 }}
        value={minute}
        onChange={e => emit(date, hour, e.target.value, ampm)}
      >
        {minutes.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${c.inputBorder}` }}>
        {["AM", "PM"].map(ap => (
          <button
            key={ap}
            type="button"
            onClick={() => emit(date, hour, minute, ap)}
            style={{
              padding: "7px 13px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: ampm === ap ? c.accent : c.input,
              color: ampm === ap ? "#fff" : c.muted,
              transition: "all 0.15s",
            }}
          >
            {ap}
          </button>
        ))}
      </div>
      {value && (
        <button type="button" onClick={() => onChange("")} style={{ ...s.iconBtn(c.muted), fontSize: 12 }}>✕</button>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function NoteApp() {
  const [dark, setDark] = useState(true);
  const c = dark ? T.dark : T.light;
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [categories, setCategories] = useState([]);
  const [notes, setNotes] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("all");
  const [sortOrder, setSortOrder] = useState("newToOld");
  const [viewMode, setViewMode] = useState("grid");
  const [dragOverNoteId, setDragOverNoteId] = useState(null);
  const [draggingNoteId, setDraggingNoteId] = useState(null);
  const [dragTabId, setDragTabId] = useState(null);
  const [dragOverTabId, setDragOverTabId] = useState(null);
  const [dbLoading, setDbLoading] = useState(false);

  const [noteModal, setNoteModal] = useState(null);
  const [shareModal, setShareModal] = useState(null);
  const [historyModal, setHistoryModal] = useState(null);
  const [reminderAlerts, setReminderAlerts] = useState([]); // [{id, noteId, title}]
  const [addTabModal, setAddTabModal] = useState(false);
  const [addTabFromNote, setAddTabFromNote] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [editingTabId, setEditingTabId] = useState(null);
  const [editingTabName, setEditingTabName] = useState("");
  const [cameraModal, setCameraModal] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrPreview, setOcrPreview] = useState(null);
  const [scanReviewModal, setScanReviewModal] = useState(null);

  const [form, setForm] = useState({ title: "", body: "", priority: false, tabs: [], attachments: [], reminder: "" });
  const [listening, setListening] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [sharePerm, setSharePerm] = useState("view");
  const [dropActive, setDropActive] = useState(false);

  const fileRef = useRef(null);
  const ocrFileRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const firedReminders = useRef(new Set());

  // ── Auth ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false); });
    const { data: { subscription } } = sb.auth.onAuthStateChange((_e, session) => { setSession(session); });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) { loadCategories(); loadNotes(); } }, [session]);

  const signOut = async () => { await sb.auth.signOut(); setNotes([]); setCategories([]); };

  // ── Load data ─────────────────────────────────────────────────────────────────
  const loadCategories = async () => {
    const { data } = await sb.from("categories").select("*").order("position");
    if (data) setCategories(data);
  };

  const loadNotes = async () => {
    setDbLoading(true);
    const { data: notesData } = await sb.from("notes").select("*").order("position");
    const { data: attachData } = await sb.from("attachments").select("*");
    const { data: histData } = await sb.from("note_history").select("*").order("created_at");
    const { data: shareData } = await sb.from("note_shares").select("*");
    if (notesData) {
      setNotes(notesData.map(n => ({
        ...n,
        tabs: n.tabs || [],
        attachments: (attachData || []).filter(a => a.note_id === n.id),
        history: (histData || []).filter(h => h.note_id === n.id).map(h => ({ user: "You", action: h.action, at: new Date(h.created_at).getTime() })),
        sharedWith: (shareData || []).filter(s => s.note_id === n.id).map(s => ({ email: s.email, permission: s.permission, at: new Date(s.created_at).getTime() })),
        order: n.position,
        createdAt: new Date(n.created_at).getTime(),
      })));
    }
    setDbLoading(false);
  };

  // ── Categories CRUD ───────────────────────────────────────────────────────────
  const addTab = async (fromNote = false) => {
    if (!newTabName.trim()) return;
    const pos = categories.length;
    const { data } = await sb.from("categories").insert({ label: newTabName.trim(), position: pos, user_id: session.user.id }).select().single();
    if (data) {
      setCategories(cats => [...cats, data]);
      if (fromNote) {
        // auto-select the new category in the note form
        setForm(f => ({ ...f, tabs: [...f.tabs, data.id] }));
      }
    }
    setNewTabName("");
    setAddTabModal(false);
    setAddTabFromNote(false);
  };

  const removeTab = async (id) => {
    await sb.from("categories").delete().eq("id", id);
    setCategories(cats => cats.filter(c => c.id !== id));
    if (activeTab === id) setActiveTab("all");
  };
  const saveTabName = async () => {
    if (!editingTabName.trim()) return;
    await sb.from("categories").update({ label: editingTabName.trim() }).eq("id", editingTabId);
    setCategories(cats => cats.map(c => c.id === editingTabId ? { ...c, label: editingTabName.trim() } : c));
    setEditingTabId(null);
  };

  // tab drag
  const onTabDragStart = (e, id) => { setDragTabId(id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); };
  const onTabDragOver = (e, id) => { e.preventDefault(); setDragOverTabId(id); };
  const onTabDrop = async (e, targetId) => {
    e.preventDefault();
    const srcId = dragTabId; setDragTabId(null); setDragOverTabId(null);
    if (!srcId || srcId === targetId) return;
    setCategories(cats => {
      const arr = [...cats];
      const fi = arr.findIndex(t => t.id === srcId), ti = arr.findIndex(t => t.id === targetId);
      const [moved] = arr.splice(fi, 1); arr.splice(ti, 0, moved);
      const updated = arr.map((t, i) => ({ ...t, position: i }));
      updated.forEach(t => sb.from("categories").update({ position: t.position }).eq("id", t.id));
      return updated;
    });
  };

  // ── Notes CRUD ────────────────────────────────────────────────────────────────
  const tabs = [...FIXED_TABS.filter(t => t.id === "all"), ...categories, ...FIXED_TABS.filter(t => t.id === "uncategorized")];

  const openNew = () => {
    setForm({ title: "", body: "", priority: false, tabs: activeTab === "all" || activeTab === "uncategorized" ? [] : [activeTab], attachments: [], reminder: "" });
    setOcrPreview(null); setNoteModal("new");
  };
  const openEdit = (note) => {
    setForm({ title: note.title, body: note.body, priority: note.priority, tabs: note.tabs, attachments: note.attachments, reminder: note.reminder ? new Date(note.reminder).toISOString().slice(0, 16) : "" });
    setOcrPreview(null); setNoteModal(note);
  };

  const saveNote = async () => {
    if (!form.title.trim()) return;
    const payload = {
      title: form.title, body: form.body, priority: form.priority,
      tabs: form.tabs, reminder: form.reminder || null,
      user_id: session.user.id,
    };
    if (noteModal === "new") {
      const { data: newNote } = await sb.from("notes").insert({ ...payload, position: 0 }).select().single();
      if (newNote) {
        await sb.from("note_history").insert({ note_id: newNote.id, user_id: session.user.id, action: "Created note" });
        const atts = [];
        for (const att of form.attachments) {
          if (att.base64) {
            const path = `${session.user.id}/${newNote.id}/${att.name}`;
            const blob = await fetch(`data:${att.type};base64,${att.base64}`).then(r => r.blob());
            await sb.storage.from("attachments").upload(path, blob, { contentType: att.type });
            const { data: { publicUrl } } = sb.storage.from("attachments").getPublicUrl(path);
            const { data: attRow } = await sb.from("attachments").insert({ note_id: newNote.id, user_id: session.user.id, name: att.name, type: att.type, url: publicUrl }).select().single();
            if (attRow) atts.push(attRow);
          } else {
            atts.push(att);
          }
        }
        setNotes(ns => [{ ...newNote, tabs: newNote.tabs || [], attachments: atts, history: [{ user: "You", action: "Created note", at: nowTs() }], sharedWith: [], order: 0, createdAt: new Date(newNote.created_at).getTime() }, ...ns.map(n => ({ ...n, order: n.order + 1 }))]);
      }
    } else {
      await sb.from("notes").update(payload).eq("id", noteModal.id);
      await sb.from("note_history").insert({ note_id: noteModal.id, user_id: session.user.id, action: "Edited note" });
      setNotes(ns => ns.map(n => n.id === noteModal.id ? { ...n, ...payload, history: [...n.history, { user: "You", action: "Edited note", at: nowTs() }] } : n));
    }
    setNoteModal(null); setOcrPreview(null);
  };

  const updateNote = async (id, patch, histAction) => {
    await sb.from("notes").update(patch).eq("id", id);
    if (histAction) await sb.from("note_history").insert({ note_id: id, user_id: session.user.id, action: histAction });
    setNotes(ns => ns.map(n => n.id === id ? { ...n, ...patch, history: histAction ? [...n.history, { user: "You", action: histAction, at: nowTs() }] : n.history } : n));
  };

  const trashNote = (id) => updateNote(id, { trashed: true }, "Moved to trash");
  const restoreFromTrash = (id) => updateNote(id, { trashed: false }, "Restored from trash");
  const deletePermanently = async (id) => { await sb.from("notes").delete().eq("id", id); setNotes(ns => ns.filter(n => n.id !== id)); };
  const toggleComplete = (id, cur) => updateNote(id, { completed: !cur }, cur ? "Restored" : "Marked complete");
  const togglePriority = (id, cur) => updateNote(id, { priority: !cur }, cur ? "Removed priority" : "Set as priority");
  const restoreFromCompleted = (id) => updateNote(id, { completed: false }, "Restored from completed");

  // ── Note drag ─────────────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e, id) => { _dragNoteId = id; setDraggingNoteId(id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); }, []);
  const handleDragOver = useCallback((e, id) => { e.preventDefault(); e.stopPropagation(); if (_dragNoteId && _dragNoteId !== id) setDragOverNoteId(id); }, []);
  const handleDrop = useCallback((e, targetId) => {
    e.preventDefault(); e.stopPropagation();
    const sourceId = _dragNoteId; _dragNoteId = null; setDraggingNoteId(null); setDragOverNoteId(null);
    if (!sourceId || sourceId === targetId) return;
    setNotes(ns => {
      const arr = [...ns];
      const fi = arr.findIndex(n => n.id === sourceId), ti = arr.findIndex(n => n.id === targetId);
      if (fi === -1 || ti === -1) return ns;
      const [moved] = arr.splice(fi, 1); arr.splice(ti, 0, moved);
      const updated = arr.map((n, i) => ({ ...n, order: i }));
      updated.forEach(n => sb.from("notes").update({ position: n.order }).eq("id", n.id));
      return updated;
    });
    setSortOrder("manual");
  }, []);
  const handleDragEnd = useCallback(() => { _dragNoteId = null; setDraggingNoteId(null); setDragOverNoteId(null); }, []);

  // ── Files ─────────────────────────────────────────────────────────────────────
  const readFile = (file) => new Promise(res => { const r = new FileReader(); r.onload = e => res({ id: uid(), name: file.name, type: file.type, url: e.target.result, base64: e.target.result.split(",")[1] }); r.readAsDataURL(file); });
  const handleFiles = async (files) => { const atts = await Promise.all(Array.from(files).map(readFile)); setForm(f => ({ ...f, attachments: [...f.attachments, ...atts] })); };

  // ── Voice ─────────────────────────────────────────────────────────────────────
  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert("Use Chrome or Edge for voice dictation.");
    const r = new SR(); r.continuous = false;
    r.onresult = e => { setForm(f => ({ ...f, body: f.body ? f.body + " " + e.results[0][0].transcript : e.results[0][0].transcript })); setListening(false); };
    r.onerror = () => setListening(false); r.onend = () => setListening(false);
    recognitionRef.current = r; r.start(); setListening(true);
  };

  // ── OCR ───────────────────────────────────────────────────────────────────────
  const handleOcrFile = async (file) => {
    setOcrLoading(true);
    const att = await readFile(file);
    const result = await ocrWithClaude(att.base64, file.type);
    setOcrLoading(false);
    if (!result) return alert("Couldn't read the image. Please try a clearer photo.");
    if (result.type === "multi" && Array.isArray(result.notes)) {
      const reviewNotes = result.notes.map((item, i) => ({ id: uid(), title: item.title || `Note ${i + 1}`, body: item.body || "", priority: false, tabs: [], reminder: "", attachments: [] }));
      setNoteModal(null); setScanReviewModal(reviewNotes);
    } else {
      setForm(f => ({ ...f, title: result.title || f.title || "Scanned Note", body: result.body || f.body }));
      setOcrPreview(att.url);
    }
    setCameraModal(false);
  };

  const acceptAllScanned = async (rn) => {
    for (const n of rn) {
      const { data } = await sb.from("notes").insert({ title: n.title, body: n.body, priority: n.priority, tabs: n.tabs, position: notes.length, user_id: session.user.id }).select().single();
      if (data) { await sb.from("note_history").insert({ note_id: data.id, user_id: session.user.id, action: "Created from image" }); }
    }
    await loadNotes(); setScanReviewModal(null);
  };
  const acceptOneScanned = async (note, all) => {
    const { data } = await sb.from("notes").insert({ title: note.title, body: note.body, priority: note.priority, tabs: note.tabs, position: 0, user_id: session.user.id }).select().single();
    if (data) { await sb.from("note_history").insert({ note_id: data.id, user_id: session.user.id, action: "Created from image" }); await loadNotes(); }
    const rem = all.filter(r => r.id !== note.id);
    rem.length === 0 ? setScanReviewModal(null) : setScanReviewModal(rem);
  };

  // ── Camera ────────────────────────────────────────────────────────────────────
  const openCamera = async () => {
    setCameraModal(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); } }, 150);
    } catch { alert("Camera requires HTTPS. This will work once the app is deployed."); setCameraModal(false); }
  };
  const capturePhoto = () => {
    const v = videoRef.current, cv = canvasRef.current; if (!v || !cv) return;
    cv.width = v.videoWidth; cv.height = v.videoHeight;
    cv.getContext("2d").drawImage(v, 0, 0);
    cv.toBlob(async blob => { streamRef.current?.getTracks().forEach(t => t.stop()); await handleOcrFile(new File([blob], "camera.jpg", { type: "image/jpeg" })); }, "image/jpeg", 0.9);
  };
  useEffect(() => () => streamRef.current?.getTracks().forEach(t => t.stop()), []);

  // ── Reminder polling ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const check = () => {
      const now = Date.now();
      notes.forEach(note => {
        if (!note.reminder || note.trashed || note.completed) return;
        const reminderTs = new Date(note.reminder).getTime();
        // fire if reminder is within the last 30s window and hasn't fired yet
        if (reminderTs <= now && reminderTs > now - 30000 && !firedReminders.current.has(note.id)) {
          firedReminders.current.add(note.id);
          playChime();
          setReminderAlerts(prev => [...prev, { alertId: `${note.id}-${reminderTs}`, noteId: note.id, title: note.title, body: note.body }]);
        }
      });
    };
    check(); // run immediately on mount/notes change
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [notes, session]);

  // ── Sharing ───────────────────────────────────────────────────────────────────
  const generateLink = async (id) => {
    const link = `${window.location.origin}/shared/${id}?token=${uid()}`;
    await sb.from("notes").update({ share_link: link }).eq("id", id);
    await sb.from("note_history").insert({ note_id: id, user_id: session.user.id, action: "Generated share link" });
    setNotes(ns => ns.map(n => n.id === id ? { ...n, shareLink: link, history: [...n.history, { user: "You", action: "Generated share link", at: nowTs() }] } : n));
  };
  const inviteEmail = async (id) => {
    if (!shareEmail.trim()) return;
    await sb.from("note_shares").upsert({ note_id: id, email: shareEmail, permission: sharePerm }, { onConflict: "note_id,email" });
    await sb.from("note_history").insert({ note_id: id, user_id: session.user.id, action: `Invited ${shareEmail} (${sharePerm})` });
    setNotes(ns => ns.map(n => n.id === id ? { ...n, sharedWith: [...n.sharedWith.filter(s => s.email !== shareEmail), { email: shareEmail, permission: sharePerm, at: nowTs() }], history: [...n.history, { user: "You", action: `Invited ${shareEmail} (${sharePerm})`, at: nowTs() }] } : n));
    setShareEmail("");
  };
  const removeInvite = async (id, email) => {
    await sb.from("note_shares").delete().eq("note_id", id).eq("email", email);
    setNotes(ns => ns.map(n => n.id === id ? { ...n, sharedWith: n.sharedWith.filter(s => s.email !== email) } : n));
  };

  // ── Reminder alert handlers ───────────────────────────────────────────────
  const dismissAlert = (alertId) => setReminderAlerts(prev => prev.filter(a => a.alertId !== alertId));
  const snoozeAlert = (alertId, noteId) => {
    dismissAlert(alertId);
    // snooze 10 min: update reminder on the note to now+10min, allow it to re-fire
    const newReminder = new Date(Date.now() + 10 * 60 * 1000).toISOString().slice(0, 16);
    firedReminders.current.delete(noteId);
    updateNote(noteId, { reminder: newReminder }, null);
  };

  // ── Filter & sort ─────────────────────────────────────────────────────────────
  const countForTab = (tabId) => {
    if (tabId === "uncategorized") return notes.filter(n => !n.completed && !n.trashed && n.tabs.length === 0).length;
    return notes.filter(n => !n.completed && !n.trashed && (tabId === "all" || n.tabs.includes(tabId))).length;
  };
  const visibleNotes = notes.filter(n => {
    if (view === "trash") return n.trashed;
    if (view === "completed") return n.completed && !n.trashed;
    if (n.completed || n.trashed) return false;
    if (activeTab === "uncategorized") return n.tabs.length === 0;
    if (activeTab !== "all" && !n.tabs.includes(activeTab)) return false;
    if (search && !n.title.toLowerCase().includes(search.toLowerCase()) && !n.body.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const sorted = [...visibleNotes].sort((a, b) => {
    if (view === "all" && a.priority !== b.priority) return a.priority ? -1 : 1;
    if (sortOrder === "manual") return a.order - b.order;
    if (sortOrder === "newToOld") return b.createdAt - a.createdAt;
    return a.createdAt - b.createdAt;
  });
  const fileIcon = (type) => type?.startsWith("image/") ? "🖼️" : type === "application/pdf" ? "📄" : type?.includes("word") || type?.includes("doc") ? "📝" : "📎";

  // ── Styles ────────────────────────────────────────────────────────────────────
  const s = {
    app: { display: "flex", height: "100vh", width: "100vw",  background: c.bg, color: c.text, fontFamily: "'DM Sans','Segoe UI',sans-serif", overflow: "hidden", fontSize: 14 },
    sidebar: { width: 220, minWidth: 220, background: c.sidebar, borderRight: `1px solid ${c.border}`, display: "flex", flexDirection: "column" },
    tabRow: (active, dragOver) => ({ display: "flex", alignItems: "center", padding: "9px 16px", fontSize: 13.5, fontWeight: active ? 600 : 400, color: active ? c.accent : c.text, background: active ? c.accentSoft : dragOver ? c.accentSoft + "99" : "transparent", borderLeft: `3px solid ${active ? c.accent : dragOver ? c.accent + "88" : "transparent"}`, transition: "all 0.13s", userSelect: "none", gap: 6 }),
    main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
    topbar: { padding: "13px 20px", borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", gap: 8, background: c.sidebar, flexWrap: "wrap" },
    searchWrap: { flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 8, background: c.input, border: `1px solid ${c.inputBorder}`, borderRadius: 10, padding: "7px 12px" },
    searchInput: { flex: 1, background: "none", border: "none", outline: "none", color: c.text, fontSize: 13.5 },
    btn: (v = "primary") => ({ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 13px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: v === "primary" ? c.accent : v === "danger" ? c.danger : v === "success" ? c.success : c.accentSoft, color: v === "ghost" ? c.text : "#fff", whiteSpace: "nowrap" }),
    iconBtn: (col) => ({ background: "none", border: "none", cursor: "pointer", color: col || c.muted, display: "inline-flex", alignItems: "center", padding: 4, borderRadius: 6 }),
    content: { flex: 1, overflowY: "auto", padding: 20 },
    grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 13 },
    listWrap: { display: "flex", flexDirection: "column", gap: 8 },
    card: (pri, dragging, dragOver) => ({ background: c.card, border: `2px solid ${dragOver ? c.accent : pri ? c.accent + "55" : c.border}`, borderRadius: 13, padding: "13px 15px", display: "flex", flexDirection: "column", gap: 8, opacity: dragging ? 0.35 : 1, cursor: "grab", transition: "border-color 0.12s, opacity 0.12s", boxShadow: dragOver ? `0 0 0 3px ${c.accent}33` : "none" }),
    listCard: (pri, dragging, dragOver) => ({ background: c.card, border: `2px solid ${dragOver ? c.accent : pri ? c.accent + "44" : c.border}`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 10, opacity: dragging ? 0.35 : 1, cursor: "grab", transition: "border-color 0.12s" }),
    modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
    mbox: { background: c.card, border: `1px solid ${c.border}`, borderRadius: 18, padding: 24, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto" },
    inp: { width: "100%", background: c.input, border: `1px solid ${c.inputBorder}`, borderRadius: 9, padding: "9px 12px", color: c.text, fontSize: 13.5, outline: "none", boxSizing: "border-box" },
    ta: { width: "100%", background: c.input, border: `1px solid ${c.inputBorder}`, borderRadius: 9, padding: "9px 12px", color: c.text, fontSize: 13.5, outline: "none", boxSizing: "border-box", resize: "vertical", minHeight: 72, fontFamily: "inherit" },
    // ── CHANGE #5: bigger, clearer form labels ─────────────────────────────────
    lbl: { fontSize: 13, fontWeight: 700, color: c.text, letterSpacing: "0.01em", marginBottom: 7, display: "block" },
    div: { height: 1, background: c.border, margin: "10px 0" },
    badge: (col) => ({ background: col || c.accent, color: "#fff", borderRadius: 20, padding: "1px 7px", fontSize: 11, fontWeight: 600, flexShrink: 0 }),
    mediaPill: (hover) => ({ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 50, border: `1.5px solid ${hover ? c.accent : c.inputBorder}`, background: hover ? c.accentSoft : c.input, color: hover ? c.accent : c.text, cursor: "pointer", fontSize: 13.5, fontWeight: 500, transition: "all 0.15s", userSelect: "none" }),
  };

  if (authLoading) return <div style={{ ...s.app, alignItems: "center", justifyContent: "center" }}><div style={{ color: c.muted }}>Loading…</div></div>;
  if (!session) return <AuthScreen c={c} s={s} />;

  return (
    <div style={s.app}>
      {/* ── sidebar ── */}
      <div style={s.sidebar}>
        <div style={{ padding: "18px 16px 14px", borderBottom: `1px solid ${c.border}` }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: c.accent, letterSpacing: "-0.5px" }}>📋 NoteFlow</div>
          <div style={{ fontSize: 11, color: c.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.user.email}</div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", paddingTop: 6 }}>
          {tabs.map((t) => (
            <div key={t.id}>
              {editingTabId === t.id ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px" }}>
                  <input autoFocus style={{ ...s.inp, padding: "5px 8px", fontSize: 13 }} value={editingTabName}
                    onChange={e => setEditingTabName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") saveTabName(); if (e.key === "Escape") setEditingTabId(null); }}
                    onBlur={saveTabName} />
                </div>
              ) : (
                <div
                  draggable={!t.fixed}
                  onDragStart={t.fixed ? undefined : e => onTabDragStart(e, t.id)}
                  onDragOver={t.fixed ? undefined : e => onTabDragOver(e, t.id)}
                  onDrop={t.fixed ? undefined : e => onTabDrop(e, t.id)}
                  onDragEnd={() => { setDragTabId(null); setDragOverTabId(null); }}
                  style={{ ...s.tabRow(view === "all" && activeTab === t.id, dragOverTabId === t.id && dragTabId !== t.id), cursor: t.fixed ? "pointer" : "grab" }}
                  onClick={() => { setActiveTab(t.id); setView("all"); }}
                  onDoubleClick={t.fixed ? undefined : e => { e.stopPropagation(); setEditingTabId(t.id); setEditingTabName(t.label); }}
                  title={t.fixed ? "" : "Double-click to rename"}
                >
                  {!t.fixed && <span style={{ color: c.muted, fontSize: 13, cursor: "grab" }}>⠿</span>}
                  <span style={{ flex: 1 }}>{t.label}</span>
                  <span style={s.badge()}>{countForTab(t.id)}</span>
                  {!t.fixed && (
                    <span style={{ marginLeft: 4 }}>
                      <span style={{ ...s.iconBtn(c.danger), padding: 2, fontSize: 11 }} onClick={e => { e.stopPropagation(); removeTab(t.id); }}>✕</span>
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
          <div style={{ ...s.tabRow(false, false), cursor: "pointer", color: c.accent, opacity: 0.8 }} onClick={() => setAddTabModal(true)}>+ Add category</div>
          <div style={s.div} />
          <div style={{ ...s.tabRow(view === "completed", false), cursor: "pointer" }} onClick={() => setView("completed")}>
            <span style={{ flex: 1 }}>🗂 Completed</span>
            <span style={s.badge(c.muted)}>{notes.filter(n => n.completed && !n.trashed).length}</span>
          </div>
          <div style={{ ...s.tabRow(view === "trash", false), cursor: "pointer" }} onClick={() => setView("trash")}>
            <span style={{ flex: 1 }}>🗑 Trash</span>
            <span style={s.badge(c.muted)}>{notes.filter(n => n.trashed).length}</span>
          </div>
        </div>

        <div style={{ padding: "10px 14px", borderTop: `1px solid ${c.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
          <button style={{ ...s.btn("ghost"), width: "100%", justifyContent: "center", fontSize: 12 }} onClick={() => setDark(d => !d)}>
            <Ico d={dark ? "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 5a7 7 0 100 14A7 7 0 0012 5z" : "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"} />
            {dark ? "Light mode" : "Dark mode"}
          </button>
          <button style={{ ...s.btn("ghost"), width: "100%", justifyContent: "center", fontSize: 12, color: c.danger }} onClick={signOut}>
            <Ico d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /> Sign Out
          </button>
        </div>
      </div>

      {/* ── main ── */}
      <div style={s.main}>
        <div style={s.topbar}>
          <div style={s.searchWrap}>
            <Ico d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
            <input style={s.searchInput} placeholder="Search notes…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select style={{ ...s.inp, width: "auto", fontSize: 12, padding: "6px 10px" }} value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
            <option value="newToOld">Newest first</option>
            <option value="oldToNew">Oldest first</option>
            <option value="manual">Manual order</option>
          </select>
          <button style={{ ...s.btn("ghost"), padding: "6px 10px" }} onClick={() => setViewMode(v => v === "grid" ? "list" : "grid")}>
            <Ico d={viewMode === "grid" ? "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" : "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"} />
          </button>
          {view === "all" && <button style={s.btn("primary")} onClick={openNew}><Ico d="M12 5v14M5 12h14" /> New Note</button>}
          {dbLoading && <span style={{ fontSize: 12, color: c.muted }}>Syncing…</span>}
        </div>

        <div style={s.content}>
          {sorted.length === 0 ? (
            <div style={{ textAlign: "center", color: c.muted, marginTop: 70 }}>
              <div style={{ fontSize: 42, marginBottom: 10 }}>{view === "trash" ? "🗑️" : view === "completed" ? "🎉" : "📝"}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: c.text }}>{view === "trash" ? "Trash is empty" : view === "completed" ? "No completed notes" : "No notes here yet"}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{view === "trash" ? "Deleted notes land here" : view === "completed" ? "Check off notes to move them here" : "Click '+ New Note' to start"}</div>
            </div>
          ) : viewMode === "grid" ? (
            <div style={s.grid}>
              {sorted.map(note => (
                <NoteCard key={note.id} note={note} s={s} c={c} tabs={tabs} view={view}
                  isDragging={draggingNoteId === note.id} isDragOver={dragOverNoteId === note.id}
                  onDragStart={e => handleDragStart(e, note.id)} onDragOver={e => handleDragOver(e, note.id)}
                  onDrop={e => handleDrop(e, note.id)} onDragEnd={handleDragEnd}
                  fileIcon={fileIcon} onEdit={() => openEdit(note)} onTrash={() => trashNote(note.id)}
                  onDelete={() => deletePermanently(note.id)} onToggleComplete={() => toggleComplete(note.id, note.completed)}
                  onTogglePriority={() => togglePriority(note.id, note.priority)} onShare={() => setShareModal(note)}
                  onHistory={() => setHistoryModal(note)}
                  onRestore={() => view === "trash" ? restoreFromTrash(note.id) : restoreFromCompleted(note.id)} />
              ))}
            </div>
          ) : (
            <div style={s.listWrap}>
              {sorted.map(note => (
                <NoteListRow key={note.id} note={note} s={s} c={c} tabs={tabs} view={view}
                  isDragging={draggingNoteId === note.id} isDragOver={dragOverNoteId === note.id}
                  onDragStart={e => handleDragStart(e, note.id)} onDragOver={e => handleDragOver(e, note.id)}
                  onDrop={e => handleDrop(e, note.id)} onDragEnd={handleDragEnd}
                  fileIcon={fileIcon} onEdit={() => openEdit(note)} onTrash={() => trashNote(note.id)}
                  onDelete={() => deletePermanently(note.id)} onToggleComplete={() => toggleComplete(note.id, note.completed)}
                  onTogglePriority={() => togglePriority(note.id, note.priority)} onShare={() => setShareModal(note)}
                  onHistory={() => setHistoryModal(note)}
                  onRestore={() => view === "trash" ? restoreFromTrash(note.id) : restoreFromCompleted(note.id)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── note modal ── */}
      {noteModal && (
        <div style={s.modal} onClick={() => setNoteModal(null)}>
          <div style={s.mbox} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{noteModal === "new" ? "✏️ New Note" : "✏️ Edit Note"}</div>
              <button style={s.iconBtn()} onClick={() => setNoteModal(null)}><Ico d="M18 6L6 18M6 6l12 12" /></button>
            </div>
            <NoteForm form={form} setForm={setForm} s={s} c={c} tabs={tabs} listening={listening}
              startListening={startListening} ocrLoading={ocrLoading} ocrPreview={ocrPreview}
              fileRef={fileRef} ocrFileRef={ocrFileRef} handleFiles={handleFiles}
              handleOcrFile={handleOcrFile} openCamera={openCamera} dropActive={dropActive} setDropActive={setDropActive}
              onAddCategory={() => { setAddTabFromNote(true); setAddTabModal(true); }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button style={s.btn("ghost")} onClick={() => setNoteModal(null)}>Cancel</button>
              <button style={s.btn("primary")} onClick={saveNote}>Save Note</button>
            </div>
          </div>
        </div>
      )}

      {/* ── scan review ── */}
      {scanReviewModal && (
        <ScanReviewModal reviewNotes={scanReviewModal} setReviewNotes={setScanReviewModal} tabs={tabs} s={s} c={c}
          onAcceptAll={() => acceptAllScanned(scanReviewModal)}
          onAcceptOne={(note) => acceptOneScanned(note, scanReviewModal)}
          onDiscard={() => setScanReviewModal(null)} />
      )}

      {/* ── camera modal ── */}
      {cameraModal && (
        <div style={s.modal} onClick={() => { streamRef.current?.getTracks().forEach(t => t.stop()); setCameraModal(false); }}>
          <div style={{ ...s.mbox, maxWidth: 480, textAlign: "center" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>📸 Take a Photo</div>
            <div style={{ fontSize: 13, color: c.muted, marginBottom: 14 }}>AI will read the image and create one or more notes automatically.</div>
            <video ref={videoRef} style={{ width: "100%", borderRadius: 10, background: "#000" }} autoPlay playsInline />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {ocrLoading && <div style={{ marginTop: 10, color: c.accent }}>🤖 Reading with AI…</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 14 }}>
              <button style={s.btn("ghost")} onClick={() => { streamRef.current?.getTracks().forEach(t => t.stop()); setCameraModal(false); }}>Cancel</button>
              <button style={s.btn("primary")} onClick={capturePhoto}>📸 Capture</button>
            </div>
          </div>
        </div>
      )}

      {/* ── share modal ── */}
      {shareModal && (() => {
        const note = notes.find(n => n.id === shareModal.id) || shareModal;
        return (
          <div style={s.modal} onClick={() => setShareModal(null)}>
            <div style={s.mbox} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Share Note</div>
                <button style={s.iconBtn()} onClick={() => setShareModal(null)}><Ico d="M18 6L6 18M6 6l12 12" /></button>
              </div>
              <div style={{ fontSize: 13, color: c.muted, marginBottom: 16 }}>"{note.title}"</div>
              <label style={s.lbl}>Share Link (view only)</label>
              {note.shareLink ? (
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <input style={{ ...s.inp, flex: 1, fontSize: 12, color: c.muted }} value={note.shareLink} readOnly />
                  <button style={s.btn("ghost")} onClick={() => navigator.clipboard?.writeText(note.shareLink)}>Copy</button>
                </div>
              ) : (
                <button style={{ ...s.btn("ghost"), width: "100%", justifyContent: "center", marginBottom: 14 }} onClick={() => generateLink(note.id)}>🔗 Generate share link</button>
              )}
              <div style={s.div} />
              <label style={s.lbl}>Invite by Email</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input style={{ ...s.inp, flex: 1 }} placeholder="email@example.com" value={shareEmail} onChange={e => setShareEmail(e.target.value)} />
                <select style={{ ...s.inp, width: "auto" }} value={sharePerm} onChange={e => setSharePerm(e.target.value)}>
                  <option value="view">View</option><option value="edit">Edit</option>
                </select>
                <button style={s.btn("primary")} onClick={() => inviteEmail(note.id)}>Invite</button>
              </div>
              {note.sharedWith?.length > 0 && <>
                <label style={s.lbl}>Shared with</label>
                {note.sharedWith.map(sw => (
                  <div key={sw.email} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${c.border}` }}>
                    <div>
                      <div style={{ fontSize: 13.5 }}>{sw.email}</div>
                      <div style={{ fontSize: 12, color: c.muted }}>{sw.permission === "edit" ? "Can edit" : "View only"} · {fmt(sw.at)}</div>
                    </div>
                    <button style={s.iconBtn()} onClick={() => removeInvite(note.id, sw.email)}><Ico d="M18 6L6 18M6 6l12 12" /></button>
                  </div>
                ))}
              </>}
            </div>
          </div>
        );
      })()}

      {/* ── history modal ── */}
      {historyModal && (() => {
        const note = notes.find(n => n.id === historyModal.id) || historyModal;
        return (
          <div style={s.modal} onClick={() => setHistoryModal(null)}>
            <div style={s.mbox} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Edit History</div>
                <button style={s.iconBtn()} onClick={() => setHistoryModal(null)}><Ico d="M18 6L6 18M6 6l12 12" /></button>
              </div>
              <div style={{ fontSize: 13, color: c.muted, marginBottom: 14 }}>"{note.title}"</div>
              {[...(note.history || [])].reverse().map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: `1px solid ${c.border}` }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: c.accent, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{h.user[0]}</div>
                  <div>
                    <div style={{ fontSize: 13.5 }}><span style={{ color: c.accent, fontWeight: 600 }}>{h.user}</span> {h.action}</div>
                    <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{fmt(h.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ── add category modal ── */}
      {addTabModal && (
        <div style={{ ...s.modal, zIndex: 300 }} onClick={() => { setAddTabModal(false); setAddTabFromNote(false); setNewTabName(""); }}>
          <div style={{ ...s.mbox, maxWidth: 320 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>Add Category</div>
            <input style={s.inp} placeholder="e.g. Finance, Sarah, Legal…" value={newTabName} onChange={e => setNewTabName(e.target.value)} onKeyDown={e => e.key === "Enter" && addTab(addTabFromNote)} autoFocus />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button style={s.btn("ghost")} onClick={() => { setAddTabModal(false); setAddTabFromNote(false); setNewTabName(""); }}>Cancel</button>
              <button style={s.btn("primary")} onClick={() => addTab(addTabFromNote)}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* ── reminder alert banners ── */}
      <div style={{ position: "fixed", top: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 10, maxWidth: 360, width: "calc(100vw - 40px)" }}>
        {reminderAlerts.map(alert => (
          <ReminderBanner
            key={alert.alertId}
            alert={alert}
            c={c}
            onDismiss={() => dismissAlert(alert.alertId)}
            onSnooze={() => snoozeAlert(alert.alertId, alert.noteId)}
            onOpen={() => { dismissAlert(alert.alertId); const note = notes.find(n => n.id === alert.noteId); if (note) openEdit(note); }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Reminder Banner ───────────────────────────────────────────────────────────
function ReminderBanner({ alert, c, onDismiss, onSnooze, onOpen }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // small delay so the CSS transition plays on mount
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => { setVisible(false); setTimeout(onDismiss, 300); };
  const snooze = () => { setVisible(false); setTimeout(onSnooze, 300); };
  const open = () => { setVisible(false); setTimeout(onOpen, 300); };

  return (
    <div style={{
      background: c.card,
      border: `1.5px solid ${c.accent}`,
      borderRadius: 16,
      padding: "14px 16px",
      boxShadow: `0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px ${c.accent}33`,
      transform: visible ? "translateX(0)" : "translateX(120%)",
      opacity: visible ? 1 : 0,
      transition: "transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease",
      display: "flex",
      flexDirection: "column",
      gap: 10,
    }}>
      {/* header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>⏰</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.accent, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>Reminder</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: c.text, lineHeight: 1.3 }}>{alert.title}</div>
          {alert.body && (
            <div style={{ fontSize: 12.5, color: c.muted, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {alert.body}
            </div>
          )}
        </div>
        <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", color: c.muted, padding: 2, flexShrink: 0, fontSize: 16, lineHeight: 1 }}>✕</button>
      </div>
      {/* action row */}
      <div style={{ display: "flex", gap: 7 }}>
        <button onClick={open} style={{ flex: 1, padding: "7px 0", background: c.accent, color: "#fff", border: "none", borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          Open Note
        </button>
        <button onClick={snooze} style={{ flex: 1, padding: "7px 0", background: c.accentSoft, color: c.accent, border: "none", borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          Snooze 10 min
        </button>
        <button onClick={dismiss} style={{ padding: "7px 12px", background: "none", color: c.muted, border: `1px solid ${c.border}`, borderRadius: 9, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ── NoteForm ──────────────────────────────────────────────────────────────────
function NoteForm({ form, setForm, s, c, tabs, listening, startListening, ocrLoading, ocrPreview, fileRef, ocrFileRef, handleFiles, handleOcrFile, openCamera, dropActive, setDropActive, onAddCategory }) {
  const [uploadHover, setUploadHover] = useState(false);
  const [cameraHover, setCameraHover] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        {/* CHANGE #5: bigger label */}
        <label style={s.lbl}>Title</label>
        {/* CHANGE #3: autoFocus so cursor lands here immediately */}
        <input autoFocus style={s.inp} placeholder="Note title…" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
          <label style={{ ...s.lbl, marginBottom: 0 }}>Body</label>
          <button style={{ ...s.btn(listening ? "primary" : "ghost"), padding: "4px 9px", fontSize: 11.5 }} onClick={startListening}>
            <Ico d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" size={13} /> {listening ? "Listening…" : "Dictate"}
          </button>
        </div>
        <textarea style={s.ta} placeholder="Write your note…" value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} />
      </div>
      <div>
        <label style={s.lbl}>Add from Image</label>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ ...s.mediaPill(uploadHover), flex: 1, justifyContent: "center" }}
            onMouseEnter={() => setUploadHover(true)} onMouseLeave={() => setUploadHover(false)}
            onClick={() => ocrFileRef.current.click()}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Upload Image
          </div>
          <div style={{ ...s.mediaPill(cameraHover), flex: 1, justifyContent: "center" }}
            onMouseEnter={() => setCameraHover(true)} onMouseLeave={() => setCameraHover(false)}
            onClick={openCamera}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Camera
          </div>
        </div>
        <input ref={ocrFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) handleOcrFile(e.target.files[0]); e.target.value = ""; }} />
        {ocrLoading && <div style={{ marginTop: 10, fontSize: 13, color: c.accent }}>🤖 AI is reading your image…</div>}
        {ocrPreview && <img src={ocrPreview} alt="scanned" style={{ marginTop: 8, maxHeight: 100, borderRadius: 8, border: `1px solid ${c.border}`, display: "block" }} />}
      </div>
      <div>
        {/* CHANGE #4: "Add Category" button inline in the categories section */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
          <label style={{ ...s.lbl, marginBottom: 0 }}>Categories</label>
          <button
            type="button"
            onClick={onAddCategory}
            style={{ ...s.btn("ghost"), padding: "3px 10px", fontSize: 12, border: `1px solid ${c.inputBorder}` }}
          >
            <Ico d="M12 5v14M5 12h14" size={12} /> New Category
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {tabs.filter(t => !t.fixed).length === 0 ? (
            <span style={{ fontSize: 12.5, color: c.muted }}>No categories yet — add one above.</span>
          ) : (
            tabs.filter(t => !t.fixed).map(t => (
              <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13.5 }}>
                <input type="checkbox" checked={form.tabs.includes(t.id)} onChange={e => setForm(f => ({ ...f, tabs: e.target.checked ? [...f.tabs, t.id] : f.tabs.filter(x => x !== t.id) }))} style={{ accentColor: c.accent, width: 15, height: 15 }} />
                {t.label}
              </label>
            ))
          )}
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13.5, fontWeight: 500 }}>
        <Star filled={form.priority} size={17} onClick={() => setForm(f => ({ ...f, priority: !f.priority }))} /> Priority
      </label>
      <div>
        {/* CHANGE #8: AM/PM reminder picker replaces datetime-local */}
        <label style={s.lbl}>Reminder</label>
        <ReminderPicker value={form.reminder} onChange={v => setForm(f => ({ ...f, reminder: v }))} s={s} c={c} />
      </div>
      <div>
        <label style={s.lbl}>Attachments</label>
        <div onDragOver={e => { e.preventDefault(); setDropActive(true); }} onDragLeave={() => setDropActive(false)}
          onDrop={e => { e.preventDefault(); setDropActive(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current.click()}
          style={{ border: `2px dashed ${dropActive ? c.accent : c.inputBorder}`, borderRadius: 10, padding: "12px", textAlign: "center", cursor: "pointer", background: dropActive ? c.accentSoft : c.input, transition: "all 0.15s", fontSize: 13, color: c.muted }}>
          📎 Drop files here or click to upload
          <div style={{ fontSize: 11.5, marginTop: 3 }}>Photos, PDFs, .doc files</div>
        </div>
        <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx" style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
        {form.attachments.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {form.attachments.map(a => (
              <span key={a.id} style={s.tag}>
                {a.type?.startsWith("image/") ? "🖼️" : a.type === "application/pdf" ? "📄" : "📝"} {a.name.length > 18 ? a.name.slice(0, 18) + "…" : a.name}
                <span style={{ cursor: "pointer", opacity: 0.5, marginLeft: 2 }} onClick={() => setForm(f => ({ ...f, attachments: f.attachments.filter(x => x.id !== a.id) }))}>✕</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Scan Review Modal ─────────────────────────────────────────────────────────
function ScanReviewModal({ reviewNotes, setReviewNotes, tabs, s, c, onAcceptAll, onAcceptOne, onDiscard }) {
  const [local, setLocal] = useState(reviewNotes);
  useEffect(() => setLocal(reviewNotes), [reviewNotes]);
  const upd = (id, field, val) => setLocal(ns => ns.map(n => n.id === id ? { ...n, [field]: val } : n));
  const remove = (id) => { const rem = local.filter(n => n.id !== id); setLocal(rem); rem.length === 0 ? onDiscard() : setReviewNotes(rem); };
  return (
    <div style={s.modal}>
      <div style={{ ...s.mbox, maxWidth: 620 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>📋 Review Notes from Image</div>
            <div style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{local.length} note{local.length !== 1 ? "s" : ""} found</div>
          </div>
          <button style={s.iconBtn()} onClick={onDiscard}><Ico d="M18 6L6 18M6 6l12 12" /></button>
        </div>
        <div style={{ display: "flex", gap: 8, padding: "10px 0 14px", borderBottom: `1px solid ${c.border}`, marginBottom: 16 }}>
          <button style={{ ...s.btn("primary"), flex: 1, justifyContent: "center", fontSize: 13 }} onClick={() => { setReviewNotes(local); onAcceptAll(); }}>✅ Accept All ({local.length})</button>
          <button style={{ ...s.btn("ghost"), fontSize: 13 }} onClick={onDiscard}>Discard All</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {local.map((note, idx) => (
            <div key={note.id} style={{ border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px", background: c.input }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: c.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Note {idx + 1}</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button style={{ ...s.btn("success"), padding: "4px 10px", fontSize: 12 }} onClick={() => onAcceptOne(local.find(n => n.id === note.id), local)}>✓ Accept</button>
                  <button style={s.iconBtn(c.danger)} onClick={() => remove(note.id)}><Ico d="M18 6L6 18M6 6l12 12" /></button>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input style={s.inp} placeholder="Title…" value={note.title} onChange={e => upd(note.id, "title", e.target.value)} />
                <textarea style={{ ...s.ta, minHeight: 56 }} placeholder="Body…" value={note.body} onChange={e => upd(note.id, "body", e.target.value)} />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 11.5, color: c.muted, fontWeight: 600 }}>Category:</span>
                  {tabs.filter(t => !t.fixed).map(t => (
                    <label key={t.id} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12.5 }}>
                      <input type="checkbox" checked={(note.tabs || []).includes(t.id)} onChange={e => upd(note.id, "tabs", e.target.checked ? [...(note.tabs || []), t.id] : (note.tabs || []).filter(x => x !== t.id))} style={{ accentColor: c.accent }} />
                      {t.label}
                    </label>
                  ))}
                  <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12.5, marginLeft: "auto" }}>
                    <Star filled={!!note.priority} size={14} onClick={() => upd(note.id, "priority", !note.priority)} /> Priority
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
        {local.length > 2 && <button style={{ ...s.btn("primary"), width: "100%", justifyContent: "center", marginTop: 16, fontSize: 13 }} onClick={() => { setReviewNotes(local); onAcceptAll(); }}>✅ Accept All ({local.length})</button>}
      </div>
    </div>
  );
}

// ── Grid Card ─────────────────────────────────────────────────────────────────
function NoteCard({ note, s, c, tabs, view, isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd, fileIcon, onEdit, onTrash, onDelete, onToggleComplete, onTogglePriority, onShare, onHistory, onRestore }) {
  const [hover, setHover] = useState(false);
  const noteTabs = tabs.filter(t => note.tabs?.includes(t.id));
  return (
    <div draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
      onDoubleClick={view === "all" ? onEdit : undefined}
      style={{ ...s.card(note.priority && view === "all", isDragging, isDragOver), background: isDragOver ? c.accentSoft : hover ? c.cardHover : c.card }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {view !== "trash" && (
          <div onClick={onToggleComplete} style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${note.completed ? c.success : c.border}`, background: note.completed ? c.success : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, marginTop: 2, transition: "all 0.13s" }}>
            {note.completed && <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, textDecoration: note.completed ? "line-through" : "none", opacity: note.completed ? 0.55 : 1 }}>{note.title}</div>
        </div>
        <Star filled={note.priority} size={15} onClick={onTogglePriority} />
      </div>
      {note.body && <div style={{ fontSize: 13, color: c.muted, lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{note.body}</div>}
      {note.attachments?.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{note.attachments.map(a => <a key={a.id} href={a.url} target="_blank" rel="noreferrer" style={{ ...s.tag, textDecoration: "none" }}>{fileIcon(a.type)} {a.name?.length > 15 ? a.name.slice(0, 15) + "…" : a.name}</a>)}</div>}
      {noteTabs.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{noteTabs.map(t => <span key={t.id} style={s.tag}>{t.label}</span>)}</div>}
      {(!note.tabs || note.tabs.length === 0) && view === "all" && <span style={{ ...s.tag, background: c.border, color: c.muted }}>Uncategorized</span>}
      {note.reminder && <div style={{ fontSize: 12, color: c.muted }}>⏰ {fmt(new Date(note.reminder).getTime())}</div>}
      {(note.sharedWith?.length > 0 || note.shareLink) && <div style={{ fontSize: 12, color: c.accent }}>🔗 Shared{note.sharedWith?.length > 0 ? ` with ${note.sharedWith.length}` : " via link"}</div>}
      <div style={{ display: "flex", gap: 2, paddingTop: 8, borderTop: `1px solid ${c.border}`, alignItems: "center" }}>
        {view === "trash" ? (<>
          <button style={s.iconBtn(c.success)} title="Restore" onClick={onRestore}><Ico d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" /></button>
          <button style={s.iconBtn(c.danger)} title="Delete forever" onClick={onDelete}><Ico d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></button>
        </>) : view === "completed" ? (<>
          <button style={s.iconBtn(c.success)} title="Restore" onClick={onRestore}><Ico d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" /></button>
          <button style={s.iconBtn(c.danger)} title="Move to trash" onClick={onTrash}><Ico d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></button>
        </>) : (<>
          <button style={s.iconBtn()} title="Edit" onClick={onEdit}><Ico d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></button>
          <button style={s.iconBtn()} title="Share" onClick={onShare}><Ico d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" /></button>
          <button style={s.iconBtn()} title="History" onClick={onHistory}><Ico d="M12 8v4l3 3M3.05 11a9 9 0 1017.9 0" /></button>
          <button style={{ ...s.iconBtn(c.danger), marginLeft: "auto" }} title="Trash" onClick={onTrash}><Ico d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></button>
        </>)}
        <div style={{ fontSize: 11, color: c.muted, marginLeft: view !== "all" ? "auto" : 0 }}>{fmt(note.createdAt)}</div>
      </div>
    </div>
  );
}

// ── List Row ──────────────────────────────────────────────────────────────────
function NoteListRow({ note, s, c, tabs, view, isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd, fileIcon, onEdit, onTrash, onDelete, onToggleComplete, onTogglePriority, onShare, onHistory, onRestore }) {
  const noteTabs = tabs.filter(t => note.tabs?.includes(t.id));
  return (
    <div draggable onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop} onDragEnd={onDragEnd}
      onDoubleClick={view === "all" ? onEdit : undefined}
      style={{ ...s.listCard(note.priority && view === "all", isDragging, isDragOver) }}>
      {view !== "trash" && (
        <div onClick={onToggleComplete} style={{ width: 17, height: 17, borderRadius: 5, border: `2px solid ${note.completed ? c.success : c.border}`, background: note.completed ? c.success : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, marginTop: 2 }}>
          {note.completed && <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, textDecoration: note.completed ? "line-through" : "none", opacity: note.completed ? 0.55 : 1 }}>{note.title}</span>
          {noteTabs.map(t => <span key={t.id} style={{ ...s.tag, fontSize: 11 }}>{t.label}</span>)}
          {(!note.tabs || note.tabs.length === 0) && view === "all" && <span style={{ ...s.tag, fontSize: 11, background: c.border, color: c.muted }}>Uncategorized</span>}
          {note.attachments?.length > 0 && <span style={{ fontSize: 12, color: c.muted }}>{note.attachments.length} 📎</span>}
          {note.reminder && <span style={{ fontSize: 11.5, color: c.muted }}>⏰ {new Date(note.reminder).toLocaleDateString()}</span>}
        </div>
        {note.body && <div style={{ fontSize: 12.5, color: c.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90%" }}>{note.body}</div>}
      </div>
      <div style={{ display: "flex", gap: 2, alignItems: "center", flexShrink: 0 }}>
        <Star filled={note.priority} size={13} onClick={onTogglePriority} />
        <span style={{ fontSize: 11, color: c.muted, marginRight: 4, marginLeft: 4 }}>{fmt(note.createdAt)}</span>
        {view === "trash" ? (<>
          <button style={s.iconBtn(c.success)} onClick={onRestore}><Ico d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" /></button>
          <button style={s.iconBtn(c.danger)} onClick={onDelete}><Ico d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></button>
        </>) : view === "completed" ? (<>
          <button style={s.iconBtn(c.success)} onClick={onRestore}><Ico d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" /></button>
          <button style={s.iconBtn(c.danger)} onClick={onTrash}><Ico d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></button>
        </>) : (<>
          <button style={s.iconBtn()} onClick={onEdit}><Ico d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></button>
          <button style={s.iconBtn()} onClick={onShare}><Ico d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" /></button>
          <button style={s.iconBtn()} onClick={onHistory}><Ico d="M12 8v4l3 3M3.05 11a9 9 0 1017.9 0" /></button>
          <button style={s.iconBtn(c.danger)} onClick={onTrash}><Ico d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></button>
        </>)}
      </div>
    </div>
  );
}
