import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useRef } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import "./Dashboard.css";
import { fetchSubmissions, fetchLatest, insertSubmission,deleteSubmission } from "../lib/vaxDB";

const PALETTE = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#0ea5a4"];

const TOTAL = { staff: 292, resident: 192 };
const pct = (num, denom) =>
  denom ? Math.min(100, Math.max(0, (num / denom) * 100)) : 0;
const fmtPct = (p) => `${(Math.round(p * 10) / 10).toFixed(1)}%`; // one decimal

export default function Dashboard({ cases = [] }) {
  const [totalStats, setTotalStats] = useState({
    active: 0,
    closed: 0,
    lostTime: 0,
    outbreak: 0,
  });

  const [bump, setBump] = useState({
    covidStaff: 0,
    covidResident: 0,
    fluStaff: 0,
    fluResident: 0,
  });
  const inc = (key) => setBump((b) => ({ ...b, [key]: b[key] + 1 }));
  const dec = (key) =>
    setBump((b) => ({ ...b, [key]: Math.max(0, b[key] - 1) }));
  const setAbs = (k, base) => (val) =>
    setBump((b) => ({ ...b, [k]: Math.max(0, val - base) }));

  const [tilePct, setTilePct] = useState({
    covid: { staff: 0, resident: 0 },
    flu: { staff: 0, resident: 0 },
  });

  // map your existing totals
  const covidStaffBase = totalStats.active;
  const covidResidentBase = totalStats.closed;
  const fluStaffBase = totalStats.lostTime;
  const fluResidentBase = totalStats.outbreak;

  // displayed values (base + bump)
  const covidStaff = covidStaffBase + bump.covidStaff;
  const covidResident = covidResidentBase + bump.covidResident;
  const fluStaff = fluStaffBase + bump.fluStaff;
  const fluResident = fluResidentBase + bump.fluResident;
  
  
  function MiniCounter({
    label,
    value, // controlled value from parent
    onIncrement,
    onDecrement,
    onSet, // new: set absolute value
  }) {
    const [draft, setDraft] = useState(String(value));

    // keep local draft in sync when parent value changes
    useEffect(() => {
      setDraft(String(value));
    }, [value]);

    const commit = () => {
      const n = Number(String(draft).replace(/[^\d-]/g, ""));
      if (Number.isFinite(n)) onSet?.(Math.max(0, Math.round(n)));
      else onSet?.(0);
    };

    return (
      <div className="mini-counter">
        <span className="mini-label">{label}</span>

        <button
          type="button"
          className="mini-btn"
          onClick={onDecrement}
          aria-label={`Subtract 1 from ${label}`}
          title={`Subtract 1 from ${label}`}
        >
          –
        </button>

        <input
          className="mini-input"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onIncrement?.();
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              onDecrement?.();
            }
          }}
          aria-label={`${label} count`}
        />

        <button
          type="button"
          className="mini-btn"
          onClick={onIncrement}
          aria-label={`Add 1 to ${label}`}
          title={`Add 1 to ${label}`}
        >
          +
        </button>
      </div>
    );
  }

  function useCountUp(target, duration = 600) {
    const [display, setDisplay] = useState(target);
    const prevRef = useRef(target);

    useEffect(() => {
      const from = prevRef.current;
      const to = target;
      if (from === to || duration === 0) {
        setDisplay(to);
        prevRef.current = to;
        return;
      }
      let start = null,
        raf;
      const step = (t) => {
        if (!start) start = t;
        const p = Math.min((t - start) / duration, 1);
        setDisplay(Math.round(from + (to - from) * p));
        if (p < 1) raf = requestAnimationFrame(step);
        else prevRef.current = to;
      };
      raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
    }, [target, duration]);

    return display;
  }

  const [drill, setDrill] = useState(null);
  const resultsRef = useRef(null);

  // state
  const [log, setLog] = useState({ covid: [], flu: [] });
  const [covidNote, setCovidNote] = useState("");
  const [fluNote, setFluNote] = useState("");

  // util
  const fmtDateOnly = (v) => {
    if (!v) return "—";
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "2-digit",
        });
  };

  useEffect(() => {
    (async () => {
      try {
        // logs
        const [covidLogs, fluLogs] = await Promise.all([
          fetchSubmissions("covid"),
          fetchSubmissions("influenza"),
        ]);
        setLog({ covid: covidLogs, flu: fluLogs });

        // tiles -> from latest row per vaccine
        const [covidLatest, fluLatest] = await Promise.all([
          fetchLatest("covid"),
          fetchLatest("influenza"),
        ]);
        setTilePct({
          covid: {
            staff: covidLatest
              ? (covidLatest.staff_count / TOTAL.staff) * 100
              : 0,
            resident: covidLatest
              ? (covidLatest.resident_count / TOTAL.resident) * 100
              : 0,
          },
          flu: {
            staff: fluLatest ? (fluLatest.staff_count / TOTAL.staff) * 100 : 0,
            resident: fluLatest
              ? (fluLatest.resident_count / TOTAL.resident) * 100
              : 0,
          },
        });
      } catch (e) {
        console.error("Load failed", e);
      }
    })();
  }, []);

  // submit handlers
  const submitCovid = async () => {
    try {
      // persist
      const row = await insertSubmission({
        vaccine: "covid",
        staff_count: covidStaff,
        resident_count: covidResident,
        note: covidNote.trim(),
        // date_only: optional override "YYYY-MM-DD"
      });

      // update table UI
      setLog((l) => ({ ...l, covid: [row, ...l.covid] }));

      // update big tiles to latest %
      setTilePct((t) => ({
        ...t,
        covid: {
          staff: Math.min(100, (row.staff_count / TOTAL.staff) * 100),
          resident: Math.min(100, (row.resident_count / TOTAL.resident) * 100),
        },
      }));
      setCovidNote("");
    } catch (e) {
      console.error("Submit COVID failed", e);
      alert("Could not save. Please try again.");
    }
  };

  const submitFlu = async () => {
    try {
      const row = await insertSubmission({
        vaccine: "influenza",
        staff_count: fluStaff,
        resident_count: fluResident,
        note: fluNote.trim(),
      });

      setLog((l) => ({ ...l, flu: [row, ...l.flu] }));

      setTilePct((t) => ({
        ...t,
        flu: {
          staff: Math.min(100, (row.staff_count / TOTAL.staff) * 100),
          resident: Math.min(100, (row.resident_count / TOTAL.resident) * 100),
        },
      }));
      setFluNote("");
    } catch (e) {
      console.error("Submit Flu failed", e);
      alert("Could not save. Please try again.");
    }
  };

  // recompute tiles from the LATEST row in the given list
  const latestToPct = (rows) => {
    const top = rows[0];
    return {
      staff: top ? Math.min(100, (top.staff_count / TOTAL.staff) * 100) : 0,
      resident: top
        ? Math.min(100, (top.resident_count / TOTAL.resident) * 100)
        : 0,
    };
  };

  // delete handler
  const isDbRow = (row) =>
    (typeof row?.id === "string" && row.id.length >= 32 && !!row.created_at) ||
    !!row.date_submitted ||
    !!row.staff_count ||
    !!row.resident_count;

  const handleDelete = async (vaccine, row) => {
    // Local (not yet in DB): just drop from UI
    if (!isDbRow(row)) {
      setLog((l) => {
        const nextList = l[vaccine].filter((x) => x.id !== row.id);
        setTilePct((t) => ({ ...t, [vaccine]: latestToPct(nextList) }));
        return { ...l, [vaccine]: nextList };
      });
      return;
    }

    try {
      const ok = await deleteSubmission(row.id);
      if (!ok) {
        alert("No row deleted (row id not found on server).");
        return;
      }
      // remove from UI and recompute tiles
      setLog((l) => {
        const nextList = l[vaccine].filter((x) => x.id !== row.id);
        setTilePct((t) => ({ ...t, [vaccine]: latestToPct(nextList) }));
        return { ...l, [vaccine]: nextList };
      });
    } catch (e) {
      console.error("Delete failed", e);
      alert(`Could not delete this row.\n${e.message ?? ""}`);
    }
  };

  return (
    <div className="dashboard">
      <div className="header-row">
        <h1>Vaccination Dashboard</h1>
      </div>

      {/* Stat cards */}
      <div className="card-grid split">
        {/* Pair 1: COVID */}
        <section className="pair">
          <div className="pair-title">COVID Vaccination</div>

          <div className="pair-grid">
            <div
              className={`stat-card clickable ${
                drill === "active" ? "selected" : ""
              }`}
              onClick={() => setDrill("active")}
            >
              <div className="stat-label">STAFF</div>
              <div className="stat-value">{fmtPct(tilePct.covid.staff)}</div>
            </div>
            <div
              className={`stat-card clickable ${
                drill === "closed" ? "selected" : ""
              }`}
              onClick={() => setDrill("closed")}
            >
              <div className="stat-label">RESIDENT</div>
              <div className="stat-value">{fmtPct(tilePct.covid.resident)}</div>
            </div>
          </div>
          {/* footer: counters + note */}
          <div className="pair-footer">
            <div className="pair-actions">
              <MiniCounter
                label="Staff"
                value={covidStaff}
                onDecrement={() => dec("covidStaff")}
                onIncrement={() => inc("covidStaff")}
                onSet={setAbs("covidStaff", covidStaffBase)} 
              />

              <MiniCounter
                label="Resident"
                value={covidResident}
                onDecrement={() => dec("covidResident")}
                onIncrement={() => inc("covidResident")}
                onSet={setAbs("covidResident", covidResidentBase)} 

              />
            </div>

            <input
              className="note-input"
              placeholder="Add note…"
              value={covidNote}
              onChange={(e) => setCovidNote(e.target.value)}
            />
          </div>

          {/* NEW: submit row below */}
          <div className="pair-submit-row">
            <button
              type="button"
              className="submit-btn danger"
              onClick={submitCovid}
            >
              Submit
            </button>
          </div>
          {log.covid.length > 0 && (
            <div className="table-card">
              <table className="submit-table">
                <colgroup>
                  <col className="col-date" />
                  <col className="col-num" />
                  <col className="col-num" />
                  <col className="col-notes" />
                  <col className="col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Date submitted</th>
                    <th>Staff</th>
                    <th>Residents</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {log.covid.map((r) => {
                    const staff = r.staff_count ?? r.staff ?? 0;
                    const residents = r.resident_count ?? r.residents ?? 0;
                    const dateVal =
                      r.date_submitted ?? r.dateOnly ?? r.dateISO ?? r.date;
                    return (
                      <tr key={r.id}>
                        <td>{fmtDateOnly(dateVal)}</td>
                        <td className="num">{staff}</td>
                        <td className="num">{residents}</td>
                        <td className="notes">{r.note || "—"}</td>
                        <td className="actions">
                          <button
                            type="button"
                            className="icon-btn danger"
                            onClick={() => {
                              if (confirm("Delete this submission?"))
                                handleDelete("covid", r);
                            }}
                            title="Delete"
                            aria-label="Delete row"
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Vertical divider */}
        <div className="pair-divider" aria-hidden="true" />

        {/* Pair 2: Influenza */}
        <section className="pair">
          <div className="pair-title">Influenza Vaccination</div>

          <div className="pair-grid">
            <div
              className={`stat-card clickable ${
                drill === "lostTime" ? "selected" : ""
              }`}
              onClick={() => setDrill("lostTime")}
            >
              <div className="stat-label">STAFF</div>
              <div className="stat-value">{fmtPct(tilePct.flu.staff)}</div>
            </div>
            <div
              className={`stat-card clickable ${
                drill === "outbreak" ? "selected" : ""
              }`}
              onClick={() => setDrill("outbreak")}
            >
              <div className="stat-label">RESIDENT</div>
              <div className="stat-value">{fmtPct(tilePct.flu.resident)}</div>
            </div>
          </div>
          {/* footer: counters + note */}
          <div className="pair-footer">
            <div className="pair-actions">
              <MiniCounter
                label="Staff"
                value={fluStaff}
                onDecrement={() => dec("fluStaff")}
                onIncrement={() => inc("fluStaff")}
                onSet={setAbs("fluStaff", fluStaffBase)}
              />

              <MiniCounter
                label="Resident"
                value={fluResident}
                onDecrement={() => dec("fluResident")}
                onIncrement={() => inc("fluResident")}
                 onSet={setAbs("fluResident", fluResidentBase)}
              />
            </div>

            <input
              className="note-input"
              placeholder="Add note…"
              value={fluNote}
              onChange={(e) => setFluNote(e.target.value)}
            />
          </div>

          {/* NEW: submit row below */}
          <div className="pair-submit-row">
            <button
              type="button"
              className="submit-btn danger"
              onClick={submitFlu}
            >
              Submit
            </button>
          </div>
          {log.flu.length > 0 && (
            <div className="table-card">
              <table className="submit-table">
                <colgroup>
                  <col className="col-date" />
                  <col className="col-num" />
                  <col className="col-num" />
                  <col className="col-notes" />
                  <col className="col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th>Date submitted</th>
                    <th>Staff</th>
                    <th>Residents</th>
                    <th>Notes</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {log.flu.map((r) => {
                    const staff = r.staff_count ?? r.staff ?? 0;
                    const residents = r.resident_count ?? r.residents ?? 0;
                    const dateVal =
                      r.date_submitted ?? r.dateOnly ?? r.dateISO ?? r.date;

                    return (
                      <tr key={r.id}>
                        <td>{fmtDateOnly(dateVal)}</td>
                        <td className="num">{staff}</td>
                        <td className="num">{residents}</td>
                        <td className="notes">{r.note || "—"}</td>
                        <td className="actions">
                          <button
                            type="button"
                            className="icon-btn danger"
                            onClick={() => {
                              if (confirm("Delete this submission?"))
                                handleDelete("flu", r);
                            }}
                            title="Delete"
                            aria-label="Delete row"
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <div ref={resultsRef} />
    </div>
  );
}
