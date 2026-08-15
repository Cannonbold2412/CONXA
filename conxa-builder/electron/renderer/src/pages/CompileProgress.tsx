import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  PIPELINE_STEPS,
  useCompileStore,
  type ApiCallEntry,
  type CompileStep,
  type LogEntry,
  type StepState,
} from "@/store/compileStore";

export function CompileProgress() {
  const { workflowId, sessionId } = useParams<{ workflowId: string; sessionId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = searchParams.get("mode") === "recompile" ? "recompile" : "compile";

  // The run lives in a store, not in this component, so it keeps going (and keeps
  // reporting) when the user navigates away. See compileStore.ts.
  const run = useCompileStore((s) => s.run);
  const start = useCompileStore((s) => s.start);
  const [blocked, setBlocked] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  const key = workflowId && sessionId ? `${workflowId}:${sessionId}:${mode}` : null;
  const isThisRun = !!key && run?.key === key;

  // Idempotent: arriving fresh starts the compile, returning mid-run re-attaches
  // to the one already going rather than starting (and billing) a second.
  useEffect(() => {
    if (!workflowId || !sessionId) return;
    setBlocked(start({ workflowId, sessionId, mode }) === "busy");
  }, [workflowId, sessionId, mode, start]);

  const steps: CompileStep[] = isThisRun
    ? run.steps
    : PIPELINE_STEPS.map((s) => ({ ...s, state: "pending" as StepState }));
  const logs: LogEntry[] = isThisRun ? run.logs : [];
  const apiCalls: ApiCallEntry[] = isThisRun ? run.apiCalls : [];
  const overallStatus: "running" | "done" | "error" = isThisRun ? run.status : "running";
  const error = isThisRun ? run.error : null;
  const skillId = isThisRun ? run.skillId : null;

  useEffect(() => {
    if (overallStatus !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [overallStatus]);

  // auto-scroll log panel — keyed on the count, not the array, since the
  // not-this-run branch hands back a fresh [] on every render.
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs.length]);

  function goToEditor() {
    if (!skillId) return;
    const fromParam = workflowId ? `?from=${encodeURIComponent(`/workflows/${workflowId}`)}` : "";
    navigate(`/edit/${encodeURIComponent(skillId)}${fromParam}`);
  }

  function goToWorkflow() {
    if (!workflowId) return;
    navigate(`/workflows/${encodeURIComponent(workflowId)}`);
  }

  const doneCount = steps.filter((s) => s.state === "done").length;
  const pct = Math.round((doneCount / steps.length) * 100);

  // Only one compile can be tracked at a time, so say so plainly rather than
  // silently showing another workflow's progress under this one's name.
  if (blocked) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium text-zinc-300">Another workflow is compiling</p>
        <p className="max-w-sm text-xs text-zinc-500">
          Compiles run one at a time. This one will start as soon as the current compile finishes.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={goToWorkflow}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.07] hover:text-white"
          >
            Back
          </button>
          {run && (
            <button
              type="button"
              onClick={() =>
                navigate(
                  `/workflows/${encodeURIComponent(run.workflowId)}/compile/${encodeURIComponent(run.sessionId)}${
                    run.mode === "recompile" ? "?mode=recompile" : ""
                  }`,
                )
              }
              className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.07] hover:text-white"
            >
              View the running compile
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      {/* Header */}
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <button
            onClick={goToWorkflow}
            style={{
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "4px 10px",
              color: "var(--text-secondary)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            ← Back
          </button>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            {mode === "recompile" ? "Recompiling workflow" : "Compiling workflow"}
          </h2>
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 4,
              background:
                overallStatus === "done"
                  ? "color-mix(in oklch, var(--green) 15%, transparent)"
                  : overallStatus === "error"
                  ? "color-mix(in oklch, var(--red) 15%, transparent)"
                  : "color-mix(in oklch, var(--accent) 15%, transparent)",
              color:
                overallStatus === "done"
                  ? "var(--green)"
                  : overallStatus === "error"
                  ? "var(--red)"
                  : "var(--accent)",
              border: `1px solid ${
                overallStatus === "done"
                  ? "color-mix(in oklch, var(--green) 30%, transparent)"
                  : overallStatus === "error"
                  ? "color-mix(in oklch, var(--red) 30%, transparent)"
                  : "color-mix(in oklch, var(--accent) 30%, transparent)"
              }`,
            }}
          >
            {overallStatus === "running"
              ? `Step ${doneCount + 1} of ${steps.length}`
              : overallStatus === "done"
              ? "Complete"
              : "Failed"}
          </span>
          <div style={{ flex: 1 }} />
          {overallStatus === "done" && skillId && (
            <button className="btn-accent" onClick={goToEditor}>
              Review steps →
            </button>
          )}
        </div>
        <ProgressBar pct={pct} status={overallStatus} />
      </div>

      {/* Three-panel body */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Compile Log */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            borderRight: "1px solid var(--border)",
            minWidth: 0,
          }}
        >
          <div
            style={{
              padding: "8px 14px",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              borderBottom: "1px solid var(--border)",
            }}
          >
            Compile Log
          </div>
          <div
            ref={logRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "8px 4px",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 12,
            }}
          >
            {logs.length === 0 ? (
              <div
                style={{
                  padding: "20px 14px",
                  color: "var(--text-muted)",
                  fontSize: 12,
                  fontStyle: "italic",
                }}
              >
                Waiting for compile to start…
              </div>
            ) : (
              logs.map((entry, i) => (
                <LogRow key={i} entry={entry} />
              ))
            )}
            {error && overallStatus === "error" && (
              <LogRow
                entry={{ ts: Date.now() / 1000, message: error, level: "error" }}
              />
            )}
          </div>
        </div>

        {/* Right column: Phase Timeline + API Calls */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Phase Timeline */}
          <div
            style={{
              flex: "0 0 auto",
              maxHeight: 260,
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
            }}
          >
            <div
              style={{
                padding: "8px 14px",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                borderBottom: "1px solid var(--border)",
                flexShrink: 0,
              }}
            >
              Phase Timeline
            </div>
            <div style={{ overflowY: "auto", padding: "6px 0" }}>
              {steps.map((step) => (
                <PhaseRow key={step.id} step={step} now={now} />
              ))}
            </div>
          </div>

          {/* API Calls */}
          <div
            style={{
              borderTop: "1px solid var(--border)",
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "8px 14px",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                borderBottom: "1px solid var(--border)",
                flexShrink: 0,
              }}
            >
              API Calls{" "}
              {apiCalls.length > 0 && (
                <span
                  style={{
                    fontWeight: 400,
                    color: "var(--accent)",
                    fontSize: 11,
                    textTransform: "none",
                  }}
                >
                  ({apiCalls.length})
                </span>
              )}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
              {apiCalls.length === 0 ? (
                <div
                  style={{
                    padding: "10px 14px",
                    color: "var(--text-muted)",
                    fontSize: 11,
                    fontStyle: "italic",
                  }}
                >
                  No LLM calls yet
                </div>
              ) : (
                apiCalls.map((call, i) => <ApiCallRow key={i} call={call} />)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ pct, status }: { pct: number; status: string }) {
  const color =
    status === "error" ? "var(--red)" : status === "done" ? "var(--green)" : "var(--accent)";
  return (
    <div
      style={{
        height: 4,
        background: "var(--bg-surface)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

function PhaseRow({ step, now }: { step: CompileStep; now: number }) {
  const elapsed =
    step.startedAt && step.endedAt
      ? ((step.endedAt - step.startedAt) / 1000).toFixed(1) + "s"
      : step.startedAt && step.state === "running"
      ? ((now - step.startedAt) / 1000).toFixed(1) + "s"
      : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 14px",
        opacity: step.state === "pending" ? 0.4 : 1,
      }}
    >
      <PhaseIcon state={step.state} />
      <span
        style={{
          fontSize: 12,
          flex: 1,
          fontWeight: step.state === "running" ? 600 : undefined,
          color:
            step.state === "error"
              ? "var(--red)"
              : step.state === "done"
              ? "var(--text-primary)"
              : "var(--text-secondary)",
        }}
      >
        {step.label}
      </span>
      {elapsed && (
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{elapsed}</span>
      )}
    </div>
  );
}

function PhaseIcon({ state }: { state: StepState }) {
  if (state === "done")
    return (
      <span style={{ color: "var(--green)", width: 16, textAlign: "center", fontSize: 13 }}>
        ✓
      </span>
    );
  if (state === "error")
    return (
      <span style={{ color: "var(--red)", width: 16, textAlign: "center", fontSize: 13 }}>
        ✗
      </span>
    );
  if (state === "running") return <Spinner />;
  return (
    <span style={{ color: "var(--text-muted)", width: 16, textAlign: "center", fontSize: 11 }}>
      ○
    </span>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const isError = entry.level === "error";
  const isWarn = entry.level === "warn";
  const timeStr = new Date(entry.ts * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        padding: "3px 14px",
        borderLeft: `2px solid ${isError ? "var(--red)" : isWarn ? "oklch(0.75 0.15 80)" : "transparent"}`,
        background: isError
          ? "color-mix(in oklch, var(--red) 6%, transparent)"
          : "transparent",
      }}
    >
      <span style={{ color: "var(--text-muted)", flexShrink: 0, fontSize: 11 }}>{timeStr}</span>
      <span
        style={{
          color: isError ? "var(--red)" : isWarn ? "oklch(0.75 0.15 80)" : "var(--text-secondary)",
          wordBreak: "break-word",
          fontSize: 12,
        }}
      >
        {entry.message}
      </span>
    </div>
  );
}

function ApiCallRow({ call }: { call: ApiCallEntry }) {
  const isOk = call.status === "ok";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 14px",
        fontSize: 11,
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: isOk ? "var(--green)" : "var(--red)",
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {call.task}
      </span>
      <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
        {call.duration_ms > 0 ? `${(call.duration_ms / 1000).toFixed(1)}s` : ""}
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        margin: "0 2px",
        border: "2px solid var(--border)",
        borderTopColor: "var(--accent)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}
