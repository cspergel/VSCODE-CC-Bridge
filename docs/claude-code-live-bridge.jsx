import { useState } from "react";

const C = {
  bg: "#06090f",
  surface: "#0d1117",
  surfaceRaised: "#151b23",
  border: "#1c2333",
  borderLight: "#2a3444",
  accent: "#25D366",
  vscode: "#007ACC",
  claude: "#f59e0b",
  relay: "#a78bfa",
  stream: "#38bdf8",
  danger: "#f43f5e",
  git: "#f97316",
  multi: "#06b6d4",
  text: "#e6edf3",
  muted: "#7d8590",
  dim: "#484f58",
};

const font = "'IBM Plex Mono', monospace";
const fontSans = "'IBM Plex Sans', sans-serif";

const Tag = ({ children, color }) => (
  <span style={{
    display: "inline-block", background: `${color}15`, color,
    fontSize: 10, fontWeight: 600, padding: "2px 8px",
    borderRadius: 4, fontFamily: font, letterSpacing: "0.3px",
  }}>{children}</span>
);

const SectionTitle = ({ children, color, sub }) => (
  <div style={{ marginBottom: 16 }}>
    <h2 style={{ color, fontSize: 16, fontWeight: 700, margin: 0, fontFamily: fontSans }}>{children}</h2>
    {sub && <p style={{ color: C.dim, fontSize: 11, margin: "4px 0 0", fontFamily: font }}>{sub}</p>}
  </div>
);

const Box = ({ title, color, tags, children, style: s }) => (
  <div style={{
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 10, padding: "14px 18px", borderTop: `2px solid ${color}`, ...s,
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
      <span style={{ color, fontSize: 13, fontWeight: 700, fontFamily: fontSans }}>{title}</span>
      {tags?.map(t => <Tag key={t} color={color}>{t}</Tag>)}
    </div>
    <div style={{ color: C.muted, fontSize: 11.5, lineHeight: 1.7, fontFamily: font }}>{children}</div>
  </div>
);

const BiFlow = ({ label, color = C.muted }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "4px 0" }}>
    {label && <span style={{ color, fontSize: 9.5, fontFamily: font, marginBottom: 2, opacity: 0.8 }}>{label}</span>}
    <span style={{ color, fontSize: 14, lineHeight: 1 }}>⇅</span>
  </div>
);

const WAMsg = ({ from, text, type, action, session }) => {
  const isBot = from === "bot";
  const bgColor = type === "decision" ? `${C.danger}18` : type === "status" ? `${C.dim}15` : type === "session" ? `${C.multi}15` : isBot ? C.surfaceRaised : `${C.accent}18`;
  const borderColor = type === "decision" ? C.danger : type === "session" ? C.multi : "transparent";
  return (
    <div style={{
      alignSelf: isBot ? "flex-start" : "flex-end",
      background: bgColor, border: `1px solid ${borderColor}`,
      borderRadius: isBot ? "10px 10px 10px 2px" : "10px 10px 2px 10px",
      padding: "8px 12px", maxWidth: "85%", fontSize: 11,
      lineHeight: 1.5, fontFamily: font, color: C.text,
    }}>
      {session && <div style={{ color: C.multi, fontSize: 9, fontWeight: 700, marginBottom: 3 }}>[{session}]</div>}
      {type === "decision" && <div style={{ color: C.danger, fontSize: 9, fontWeight: 700, marginBottom: 3 }}>⚠ DECISION REQUIRED</div>}
      {type === "status" && <div style={{ color: C.dim, fontSize: 9, fontWeight: 600, marginBottom: 3 }}>📡 STREAM</div>}
      {type === "context" && <div style={{ color: C.git, fontSize: 9, fontWeight: 600, marginBottom: 3 }}>📋 CONTEXT</div>}
      <div style={{ whiteSpace: "pre-wrap" }}>{text}</div>
      {action && (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {action.map(a => (
            <span key={a} style={{
              background: a === "Accept" ? `${C.accent}25` : a === "Show diff" ? `${C.vscode}20` : `${C.danger}20`,
              color: a === "Accept" ? C.accent : a === "Show diff" ? C.vscode : C.danger,
              fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 4,
            }}>{a}</span>
          ))}
        </div>
      )}
    </div>
  );
};

const SessionDot = ({ name, active, waiting }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 8,
    padding: "6px 10px", background: active ? `${C.accent}10` : C.surfaceRaised,
    borderRadius: 6, border: `1px solid ${active ? C.accent + "30" : C.border}`,
  }}>
    <div style={{
      width: 8, height: 8, borderRadius: "50%",
      background: active ? C.accent : C.dim,
      boxShadow: active ? `0 0 6px ${C.accent}60` : "none",
    }} />
    <span style={{ color: active ? C.text : C.muted, fontSize: 11, fontFamily: font, fontWeight: active ? 600 : 400 }}>{name}</span>
    {waiting && <Tag color={C.danger}>WAITING</Tag>}
    {active && <Tag color={C.accent}>📱 ACTIVE</Tag>}
  </div>
);

export default function Architecture() {
  const [activeTab, setActiveTab] = useState("arch");

  const tabs = [
    { id: "arch", label: "Architecture" },
    { id: "stream", label: "Stream Engine" },
    { id: "multi", label: "Multi-Instance" },
    { id: "git", label: "Git Context" },
    { id: "ux", label: "Phone UX" },
    { id: "ext", label: "VS Code Ext" },
  ];

  return (
    <div style={{
      background: C.bg, minHeight: "100vh", color: C.text,
      fontFamily: fontSans, padding: "28px 20px",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ maxWidth: 900, margin: "0 auto 24px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            <span style={{ color: C.accent }}>WA</span>
            <span style={{ color: C.dim, margin: "0 4px" }}>⟷</span>
            <span style={{ color: C.claude }}>Claude Code</span>
            <span style={{ color: C.vscode, marginLeft: 4 }}>Live Bridge</span>
          </h1>
          <Tag color={C.multi}>v1.2 — MULTI-INSTANCE + GIT CONTEXT</Tag>
        </div>
        <p style={{ color: C.dim, fontSize: 12, fontFamily: font, margin: "8px 0 0" }}>
          Live PTY stream · Activity classification · Multi-session routing · Git context enrichment · Seamless handoff
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        maxWidth: 900, margin: "0 auto 20px",
        display: "flex", gap: 2, borderBottom: `1px solid ${C.border}`,
        overflowX: "auto",
      }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: activeTab === t.id ? C.surfaceRaised : "transparent",
            color: activeTab === t.id ? C.text : C.dim,
            border: "none",
            borderBottom: activeTab === t.id ? `2px solid ${C.accent}` : "2px solid transparent",
            padding: "8px 14px", fontSize: 11.5, fontWeight: 600,
            fontFamily: fontSans, cursor: "pointer",
            borderRadius: "6px 6px 0 0", whiteSpace: "nowrap",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* ─── ARCHITECTURE ─── */}
        {activeTab === "arch" && (
          <div>
            <SectionTitle color={C.accent} sub="Core system — bidirectional live sessions with multi-instance routing">System Overview</SectionTitle>

            <Box title="📱 WhatsApp (You, on mobile)" color={C.accent} tags={["BAILEYS", "SESSION ROUTING"]}>
              Send commands · Route to specific sessions via /name prefix · Receive live stream digests ·
              Respond to decision prompts · /sessions to list all instances · /switch to change target ·
              /all to broadcast across sessions
            </Box>
            <BiFlow label="Baileys WebSocket" color={C.accent} />

            <Box title="⚡ Bridge Server" color={C.relay} tags={["NODE.JS", "BAILEYS", "AUTH"]}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ color: C.relay, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>INBOUND</div>
                  Phone allowlist auth<br/>Parse message intent<br/>Safety filter (blocklist)<br/>
                  <span style={{ color: C.multi }}>Session route resolution</span>
                </div>
                <div>
                  <div style={{ color: C.relay, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>OUTBOUND</div>
                  Activity classifier output<br/>Smart truncation + batching<br/>
                  Decision prompt formatting<br/>
                  <span style={{ color: C.multi }}>[session] tag prefixing</span>
                </div>
              </div>
            </Box>
            <BiFlow label="WebSocket (persistent)" color={C.relay} />

            <Box title="🤖 Local Agent (daemon)" color={C.claude} tags={["PTY", "CLASSIFIER", "SESSION REGISTRY", "GIT CONTEXT"]}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ color: C.claude, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>PTY WRAPPER</div>
                  Spawns claude-code per session<br/>
                  Captures full interactive stream<br/>
                  Injects replies into stdin<br/>
                  <span style={{ color: C.git }}>Auto-injects git context</span>
                </div>
                <div>
                  <div style={{ color: C.multi, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>SESSION REGISTRY</div>
                  Named sessions (auto from repo)<br/>
                  Alias routing + fuzzy match<br/>
                  Active session pointer for WA<br/>
                  Detached session keepalive
                </div>
              </div>
            </Box>
            <BiFlow label="IPC / localhost WS (per session)" color={C.vscode} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <Box title="💻 VS Code #1" color={C.vscode} tags={["chartcopilot"]} style={{ borderTop: `2px solid ${C.accent}` }}>
                <span style={{ color: C.accent }}>● WA Active</span><br/>
                Full stream + diffs<br/>
                Accept/reject actions
              </Box>
              <Box title="💻 VS Code #2" color={C.vscode} tags={["scheduler"]}>
                <span style={{ color: C.dim }}>○ WA Inactive</span><br/>
                Full stream + diffs<br/>
                Cross-session alerts
              </Box>
              <Box title="💻 VS Code #3" color={C.vscode} tags={["scrubgate"]}>
                <span style={{ color: C.dim }}>○ Detached</span><br/>
                CC running, VS Code closed<br/>
                WA-routable
              </Box>
            </div>
          </div>
        )}

        {/* ─── STREAM ENGINE ─── */}
        {activeTab === "stream" && (
          <div>
            <SectionTitle color={C.stream} sub="How raw PTY output becomes smart WhatsApp messages">Activity Classifier + Stream Router</SectionTitle>

            <Box title="Raw PTY Stream (claude-code)" color={C.claude} tags={["STDIN/STDOUT"]}>
              <pre style={{ margin: 0, fontSize: 10.5, color: C.muted, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
{`> Reading src/api/auth.ts...
> Analyzing authentication flow...
> Found 3 issues:
>   1. No token expiry validation
>   2. Missing refresh token rotation  
>   3. Catch block swallows errors silently
>
> Should I proceed with all three fixes? (y/n)`}</pre>
            </Box>

            <BiFlow label="pipes through classifier" color={C.stream} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
              <Box title="STATUS" color={C.dim} tags={["BATCH"]}>
                "Reading file…"<br/>"Analyzing…"<br/><br/>
                → Batch digest ~10s<br/>
                → <span style={{ color: C.dim }}>Low priority</span>
              </Box>
              <Box title="OUTPUT" color={C.text} tags={["SUMMARIZE"]}>
                Results, diffs<br/><br/>
                → Summarize for phone<br/>
                → Full to VS Code<br/>
                → <span style={{ color: C.muted }}>Medium</span>
              </Box>
              <Box title="DECISION" color={C.danger} tags={["IMMEDIATE"]}>
                "Should I proceed?"<br/><br/>
                → Push immediately<br/>
                → Action prompts<br/>
                → <span style={{ color: C.danger }}>High priority</span>
              </Box>
              <Box title="ERROR" color={"#ef4444"} tags={["IMMEDIATE"]}>
                Stack traces<br/><br/>
                → Push immediately<br/>
                → Summary + trace<br/>
                → <span style={{ color: "#ef4444" }}>High priority</span>
              </Box>
            </div>

            <div style={{ marginTop: 16 }}>
              <Box title="Classification Heuristics" color={C.stream} tags={["YAML CONFIGURABLE"]}>
                <pre style={{ margin: 0, fontSize: 10, color: C.muted, whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{
`DECISION signals (→ immediate push):
  • ends with ? + PTY in input-wait state (>500ms silence)
  • contains "proceed" / "confirm" / "apply" / "y/n"
  • permission prompts: "run this command?" / "create file?"

STATUS signals (→ batch digest):
  • "reading" / "searching" / "analyzing" / "loading"
  • progress indicators, spinners, file traversal

OUTPUT signals (→ summarize + forward):
  • code blocks, diffs, explanations, test results
  • anything >2 lines that isn't a question

ERROR signals (→ immediate push):
  • stderr, stack traces, Error:, FATAL, exit code [1-9]`
                }</pre>
              </Box>
            </div>
          </div>
        )}

        {/* ─── MULTI-INSTANCE ─── */}
        {activeTab === "multi" && (
          <div>
            <SectionTitle color={C.multi} sub="Route WhatsApp to the right Claude Code instance across multiple VS Code windows">Multi-Instance Session Routing</SectionTitle>

            <Box title="Session Registry" color={C.multi} tags={["LOCAL AGENT"]}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                <SessionDot name="chartcopilot" active waiting={false} />
                <SessionDot name="hospitalist-scheduler" active={false} waiting />
                <SessionDot name="scrubgate" active={false} waiting={false} />
              </div>
              <div style={{ marginTop: 10, color: C.dim, fontSize: 10 }}>
                Aliases: ccp → chartcopilot · sched → hospitalist-scheduler · sg → scrubgate
              </div>
            </Box>

            <div style={{ marginTop: 16 }}>
              <SectionTitle color={C.multi} sub="Three routing mechanisms, evaluated in priority order">WhatsApp Routing</SectionTitle>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <Box title="1. Explicit Prefix" color={C.multi} tags={["HIGHEST"]}>
                <span style={{ color: C.text, fontFamily: font, fontSize: 11 }}>/ccp fix the HCC pipeline</span><br/><br/>
                Routes to chartcopilot via alias<br/>
                Doesn't change active pointer<br/>
                Fuzzy matching on names
              </Box>
              <Box title="2. Sticky Session" color={C.multi} tags={["DEFAULT"]}>
                <span style={{ color: C.text, fontFamily: font, fontSize: 11 }}>fix the token bug</span><br/><br/>
                Goes to last-used session<br/>
                Agent confirms: [chartcopilot]<br/>
                No prefix needed
              </Box>
              <Box title="3. Explicit Switch" color={C.multi} tags={["MANUAL"]}>
                <span style={{ color: C.text, fontFamily: font, fontSize: 11 }}>/switch scheduler</span><br/><br/>
                Changes active pointer<br/>
                Replies with git context<br/>
                of target session
              </Box>
            </div>

            <div style={{ marginTop: 16 }}>
              <Box title="Multi-Session WhatsApp Commands" color={C.multi} tags={["REFERENCE"]}>
                <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "4px 12px", fontSize: 11 }}>
                  {[
                    ["/sessions", "List all sessions with status, branch, pending decisions"],
                    ["/switch <n>", "Switch active session; get git context of target"],
                    ["/<n> <cmd>", "One-shot route without switching active pointer"],
                    ["/all <cmd>", "Broadcast to all sessions (e.g. /all run tests)"],
                    ["/detach", "Stop WA forwarding; Claude Code keeps running"],
                    ["/attach <n>", "Reattach detached session to WA"],
                  ].map(([cmd, desc], i) => (
                    <div key={i} style={{ display: "contents" }}>
                      <span style={{ color: C.multi, fontFamily: font }}>{cmd}</span>
                      <span style={{ color: C.muted }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </Box>
            </div>

            <div style={{ marginTop: 16 }}>
              <Box title="Conflict Resolution" color={C.danger} tags={["MULTIPLE DECISIONS"]}>
                When multiple sessions have pending DECISION prompts simultaneously:<br/><br/>
                <span style={{ color: C.text }}>WhatsApp:</span> Only shows decisions from active session. Others queue until you /switch.<br/>
                <span style={{ color: C.text }}>VS Code:</span> Each window shows its own decisions — accept/reject from any window anytime.<br/>
                <span style={{ color: C.text }}>/sessions:</span> Shows [WAITING] flag on sessions with pending decisions.<br/>
                <span style={{ color: C.text }}>Cross-notify:</span> VS Code shows notifications for non-active sessions: "Scheduler waiting: Apply 3 fixes?"
              </Box>
            </div>
          </div>
        )}

        {/* ─── GIT CONTEXT ─── */}
        {activeTab === "git" && (
          <div>
            <SectionTitle color={C.git} sub="Every WhatsApp command arrives with full workspace awareness">Git Context Enrichment</SectionTitle>

            <Box title="Context Snapshot (rolling, event-driven)" color={C.git} tags={["AUTO-REFRESH"]}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ color: C.git, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>CAPTURED DATA</div>
                  <span style={{ color: C.text }}>Branch:</span> main ↓3 behind remote<br/>
                  <span style={{ color: C.text }}>Uncommitted:</span> 2 files (+45 -12)<br/>
                  <span style={{ color: C.text }}>Recent commits:</span> last 3 messages<br/>
                  <span style={{ color: C.text }}>Open files:</span> auth.ts, routes.ts<br/>
                  <span style={{ color: C.text }}>Active file:</span> auth.ts:42<br/>
                  <span style={{ color: C.text }}>Repo:</span> chartcopilot
                </div>
                <div>
                  <div style={{ color: C.git, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>REFRESH TRIGGERS</div>
                  File save (onDidSaveTextDocument)<br/>
                  Branch switch (.git/HEAD watcher)<br/>
                  Git ops (.git/index watcher)<br/>
                  Editor tab change<br/>
                  Manual: /ctx or VS Code command<br/>
                  <span style={{ color: C.dim }}>Fallback: git CLI when VS Code offline</span>
                </div>
              </div>
            </Box>

            <BiFlow label="injected into commands" color={C.git} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Box title="Auto-Inject Mode (default)" color={C.git} tags={["TRANSPARENT"]}>
                Your WhatsApp message:<br/>
                <span style={{ color: C.accent }}>"fix the token bug"</span><br/><br/>
                Claude Code receives:<br/>
                <span style={{ color: C.git, fontSize: 10 }}>[ctx: main ↓3 | 2 files changed (+45 -12) | open: auth.ts, routes.ts]</span><br/>
                <span style={{ color: C.text }}>fix the token bug</span><br/><br/>
                <span style={{ color: C.dim }}>Context is silently prefixed — you never see it</span>
              </Box>
              <Box title="On-Demand Mode" color={C.git} tags={["EXPLICIT"]}>
                Context only injected when:<br/><br/>
                <span style={{ color: C.multi }}>/ctx</span> — you request it<br/>
                <span style={{ color: C.multi }}>/ctx full</span> — verbose snapshot to WA<br/>
                Claude Code asks "what are you working on?" — auto-detected and injected<br/><br/>
                <span style={{ color: C.dim }}>Less noise, more control</span>
              </Box>
            </div>

            <div style={{ marginTop: 16 }}>
              <Box title="Privacy & Size Management" color={C.dim} tags={["SAFETY"]}>
                <span style={{ color: C.text }}>Never includes file contents</span> — only metadata (names, line counts, change summaries)<br/>
                Diffs summarized as statistics, not raw patches<br/>
                Capped at 10 most recently modified files<br/>
                <span style={{ color: C.danger }}>Excluded by default:</span> .env, *.key, *secret*, credentials/* (configurable)
              </Box>
            </div>

            <div style={{ marginTop: 16 }}>
              <Box title="Per-Session Context" color={C.multi} tags={["MULTI-INSTANCE"]}>
                Each session maintains its own independent context snapshot.<br/>
                When you /switch sessions, the agent replies with the target session's context —<br/>
                so you immediately know: what branch, what's changed, what's open.<br/><br/>
                <span style={{ color: C.dim }}>
                  /switch scheduler → "[scheduler] main +2 | 1 file changed | open: constraints.ts, shifts.ts"
                </span>
              </Box>
            </div>
          </div>
        )}

        {/* ─── PHONE UX ─── */}
        {activeTab === "ux" && (
          <div>
            <SectionTitle color={C.accent} sub="Multi-session conversation flow on your phone">WhatsApp UX</SectionTitle>

            <div style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: 16,
              display: "flex", flexDirection: "column", gap: 8, maxWidth: 420,
            }}>
              <div style={{ textAlign: "center", color: C.dim, fontSize: 10, fontFamily: font, padding: "4px 0" }}>
                Today 2:34 PM — Claude Code Bridge
              </div>

              <WAMsg from="user" text="/ccp fix the auth middleware — tokens aren't validated on refresh" />
              <WAMsg from="bot" type="status" session="chartcopilot" text="📂 Reading src/api/auth.ts, src/middleware/validate.ts\n🔍 Analyzing token flow..." />
              <WAMsg from="bot" session="chartcopilot" text={"Found 3 issues:\n1. No expiry check on jwt.verify()\n2. Refresh tokens aren't rotated\n3. Errors silently swallowed"} />
              <WAMsg from="bot" type="decision" session="chartcopilot" text={"Apply all 3 fixes?\n2 files modified, ~45 lines changed"} action={["Accept", "Reject", "Show diff"]} />
              <WAMsg from="user" text="accept all" />
              <WAMsg from="bot" session="chartcopilot" text={"✅ Applied 3 fixes · 2 files · abc3f2e"} />

              <div style={{ borderTop: `1px solid ${C.border}`, margin: "4px 0", paddingTop: 8 }}>
                <div style={{ textAlign: "center", color: C.multi, fontSize: 9, fontFamily: font }}>SESSION SWITCH</div>
              </div>

              <WAMsg from="user" text="/switch scheduler" />
              <WAMsg from="bot" type="context" session="scheduler" text={"📋 Switched to hospitalist-scheduler\n🌿 main ↑1 ahead\n📝 1 file changed (+12 -3)\n📂 open: constraints.ts, shifts.ts"} />
              <WAMsg from="user" text="add a no-consecutive-weekends constraint" />
              <WAMsg from="bot" type="status" session="scheduler" text="📂 Reading src/constraints/...\n🔍 Analyzing existing constraint rules..." />
              <WAMsg from="bot" type="decision" session="scheduler" text={"Add NoConsecutiveWeekends constraint to\nconstraints.ts? (+28 lines)"} action={["Accept", "Reject"]} />
              <WAMsg from="user" text="1" />
              <WAMsg from="bot" session="scheduler" text={"✅ Added constraint · constraints.ts · d4e1a2b\n🧪 Running constraint tests...\n✅ 8/8 passing"} />
            </div>

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Box title="Routing UX" color={C.multi}>
                • /name prefix routes without switching<br/>
                • Unqualified msgs go to sticky session<br/>
                • [session] tags on all multi-session msgs<br/>
                • /switch shows git context of target<br/>
                • /sessions shows all with [WAITING] flags
              </Box>
              <Box title="Message UX" color={C.accent}>
                • Status batched into periodic digests<br/>
                • Diffs as natural language, not raw patches<br/>
                • Decision points with tap-able actions<br/>
                • Reply with number (1, 2) for quick action<br/>
                • Interrupt anytime to redirect mid-task
              </Box>
            </div>
          </div>
        )}

        {/* ─── VS CODE EXTENSION ─── */}
        {activeTab === "ext" && (
          <div>
            <SectionTitle color={C.vscode} sub="Full fidelity + multi-session awareness + seamless handoff">VS Code Extension Panel</SectionTitle>

            <div style={{
              background: "#1e1e1e", border: `1px solid ${C.border}`,
              borderRadius: 10, overflow: "hidden", maxWidth: 520,
            }}>
              {/* title bar */}
              <div style={{
                background: "#252526", padding: "8px 14px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                borderBottom: `1px solid ${C.border}`,
              }}>
                <span style={{ color: C.vscode, fontSize: 12, fontWeight: 700, fontFamily: fontSans }}>
                  Claude Code Bridge — chartcopilot
                </span>
                <div style={{ display: "flex", gap: 6 }}>
                  <Tag color={C.accent}>● 📱 WA ROUTED HERE</Tag>
                  <Tag color={C.vscode}>LIVE</Tag>
                </div>
              </div>

              {/* other sessions bar */}
              <div style={{
                background: "#1a1a2e", padding: "6px 14px",
                borderBottom: `1px solid ${C.border}`,
                display: "flex", gap: 8, alignItems: "center",
              }}>
                <span style={{ color: C.dim, fontSize: 9, fontFamily: font }}>OTHER SESSIONS:</span>
                <span style={{ color: C.muted, fontSize: 10, fontFamily: font }}>scheduler</span>
                <Tag color={C.danger}>WAITING</Tag>
                <span style={{ color: C.muted, fontSize: 10, fontFamily: font }}>scrubgate</span>
                <span style={{ color: C.dim, fontSize: 9, fontFamily: font }}>(detached)</span>
              </div>

              {/* messages */}
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6, fontSize: 11, fontFamily: font }}>
                <div style={{ color: C.dim, fontSize: 9, textAlign: "center", padding: 4 }}>Session started 2:34 PM</div>

                <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <span style={{ color: C.accent, fontSize: 9, flexShrink: 0, marginTop: 2 }}>📱</span>
                  <div style={{ color: C.text, background: `${C.accent}12`, padding: "6px 10px", borderRadius: 6, lineHeight: 1.5 }}>
                    fix the auth middleware — tokens aren't validated on refresh
                    <div style={{ color: C.git, fontSize: 9, marginTop: 4, opacity: 0.7 }}>
                      [ctx: main ↓3 | 2 files +45 -12 | auth.ts, routes.ts]
                    </div>
                  </div>
                </div>

                <div style={{ color: C.dim, padding: "2px 0 2px 20px", fontSize: 10, lineHeight: 1.6 }}>
                  Reading src/api/auth.ts...<br/>Analyzing token flow...
                </div>

                <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <span style={{ color: C.claude, fontSize: 9, flexShrink: 0, marginTop: 2 }}>🤖</span>
                  <div style={{ color: C.text, background: C.surfaceRaised, padding: "6px 10px", borderRadius: 6, lineHeight: 1.5 }}>
                    Found 3 issues in token validation flow...
                  </div>
                </div>

                {/* inline diff */}
                <div style={{
                  background: "#1a1a2e", border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: 10, margin: "4px 0 4px 20px",
                }}>
                  <div style={{ color: C.vscode, fontSize: 9, fontWeight: 700, marginBottom: 6 }}>validate.ts — 3 changes</div>
                  <div style={{ fontSize: 10, lineHeight: 1.6 }}>
                    <div style={{ color: "#f85149" }}>- return token;</div>
                    <div style={{ color: "#3fb950" }}>+ const newPair = rotateRefreshToken(token);</div>
                    <div style={{ color: "#3fb950" }}>+ auditRotation(token.sub, rotationCount);</div>
                    <div style={{ color: "#3fb950" }}>+ return newPair;</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                    <span style={{ background: `${C.accent}25`, color: C.accent, fontSize: 10, fontWeight: 600, padding: "3px 12px", borderRadius: 4 }}>✓ Accept</span>
                    <span style={{ background: `${C.danger}15`, color: C.danger, fontSize: 10, fontWeight: 600, padding: "3px 12px", borderRadius: 4 }}>✗ Reject</span>
                    <span style={{ background: `${C.dim}20`, color: C.muted, fontSize: 10, fontWeight: 600, padding: "3px 12px", borderRadius: 4 }}>💬 Comment</span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <span style={{ color: C.accent, fontSize: 9, flexShrink: 0, marginTop: 2 }}>📱</span>
                  <div style={{ color: C.text, background: `${C.accent}12`, padding: "6px 10px", borderRadius: 6, lineHeight: 1.5 }}>
                    accept all <span style={{ color: C.dim, fontSize: 9 }}>(via WhatsApp)</span>
                  </div>
                </div>

                <div style={{ color: "#3fb950", padding: "2px 0 2px 20px", fontSize: 10 }}>
                  ✅ Applied 3 fixes · 2 files · abc3f2e
                </div>

                {/* cross-session notification */}
                <div style={{
                  background: `${C.danger}10`, border: `1px solid ${C.danger}30`,
                  borderRadius: 6, padding: "8px 12px", margin: "4px 0",
                }}>
                  <div style={{ color: C.danger, fontSize: 9, fontWeight: 700, marginBottom: 2 }}>🔔 CROSS-SESSION NOTIFICATION</div>
                  <div style={{ color: C.muted, fontSize: 10 }}>
                    <span style={{ color: C.text }}>scheduler</span> is waiting: "Add NoConsecutiveWeekends constraint? (+28 lines)"
                    <span style={{ color: C.multi, marginLeft: 8, textDecoration: "underline" }}>Switch to scheduler →</span>
                  </div>
                </div>
              </div>

              {/* input bar */}
              <div style={{
                borderTop: `1px solid ${C.border}`, padding: "8px 12px",
                display: "flex", gap: 8, alignItems: "center",
              }}>
                <div style={{
                  flex: 1, background: "#2d2d2d", borderRadius: 4,
                  padding: "6px 10px", color: C.dim, fontSize: 11, fontFamily: font,
                }}>Type here to take over from phone...</div>
                <Tag color={C.vscode}>⏎</Tag>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 16 }}>
              <Box title="Seamless Handoff" color={C.vscode}>
                Phone msgs show 📱 icon<br/>
                Local msgs show normally<br/>
                Type in VS Code → takes over<br/>
                Type on phone → takes over<br/>
                <span style={{ color: C.vscode }}>CC never knows the difference</span>
              </Box>
              <Box title="Multi-Session Aware" color={C.multi}>
                Green/gray dot per session<br/>
                Other Sessions bar at top<br/>
                [WAITING] flags on decisions<br/>
                Click to switch WA routing<br/>
                Cross-session notifications
              </Box>
              <Box title="Workspace Actions" color={C.vscode}>
                Accept/reject inline diffs<br/>
                Trigger formatters on accept<br/>
                Git stage, commit, push<br/>
                Run extensions (Prettier, etc)<br/>
                Open changed files in tabs
              </Box>
            </div>
          </div>
        )}

        {/* ── TECH STACK FOOTER ── */}
        <div style={{
          marginTop: 28, padding: "16px 18px",
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[
                { l: "Baileys", c: C.accent },
                { l: "node-pty", c: C.claude },
                { l: "Activity Classifier", c: C.stream },
                { l: "Session Registry", c: C.multi },
                { l: "Git Context", c: C.git },
                { l: "WebSocket relay", c: C.relay },
                { l: "VS Code Extension API", c: C.vscode },
                { l: "claude-code CLI", c: C.claude },
                { l: "better-sqlite3", c: C.dim },
              ].map(t => <Tag key={t.l} color={t.c}>{t.l}</Tag>)}
            </div>
            <span style={{ color: C.dim, fontSize: 10, fontFamily: font }}>claude code live bridge v1.2</span>
          </div>
        </div>
      </div>
    </div>
  );
}
