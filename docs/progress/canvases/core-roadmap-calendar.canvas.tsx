import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Spacer,
  Stack,
  Stat,
  Text,
  useCanvasAction,
  useCanvasState,
  useHostTheme,
  useMemo,
  useState,
} from "cursor/canvas";

type Kind = "build" | "review" | "off";

type Day = {
  kind: Kind;
  label: string;
  title: string;
  tasks: string[];
  gate?: string;
  note?: string;
};

const PROMPTS = "docs/research/product-research-prompts.md";
const ROADMAP = "docs/research/top-1-percent-ai-agent-engineer-roadmap.md";

function build(label: string, title: string, tasks: string[], gate?: string, note?: string): Day {
  return { kind: "build", label, title, tasks, gate, note };
}

function review(title: string, tasks: string[]): Day {
  return { kind: "review", label: "Review", title, tasks };
}

const OFF: Day = { kind: "off", label: "Off", title: "Day off", tasks: [] };

const WEEKS: Day[][] = [
  [
    build("On-ramp", "Kick off research, start the On-ramp", [
      "10:00 Start the four /research prompts, each in its own chat (docs/research/product-research-prompts.md)",
      "Create learning/ and run /teach with the mission: build a production-grade support agent on Medusa",
      "Medusa customization docs: modules and data models",
      "Build a custom module in a throwaway Medusa project, not in goods",
    ]),
    build("On-ramp", "On-ramp: API routes and workflows", [
      "Expose the module through a custom API route",
      "Write a workflow with steps and compensation",
      "Use /teach for any TypeScript gap that slowed you down",
      "Check that the four research agents are still running",
    ]),
    build("On-ramp", "On-ramp: subscribers and jobs, then read the research", [
      "Add a subscriber and a scheduled job",
      "Write the On-ramp explain-back",
      "Pass the On-ramp gate and learning gate",
      "14:00 Read the four research reports and note gaps",
      "Re-run /research on any gap that would change the decision",
    ], "On-ramp"),
    build("Research", "Research: score and decide the product category", [
      "Score the candidate categories with the solo-seller filter",
      "Check project fit: rich attributes, real support questions",
      "Shortlist three and pick one",
      "Write the category ADR in docs/adr/ and fill docs/project-configuration.md",
      "Pass the Research gate and learning gate",
    ], "Research"),
    build("Setup 1", "Setup 1: machine, repo, and tickets", [
      "Setup 1 Day 1: verify the machine and record versions",
      "git init goods, create the private GitHub repo, enable branch protection and secret scanning",
      "Run /to-tickets on Setup 1 and Setup 2 (Steps 1 to 13 get tickets from the Step 1 spec)",
      "Legal track: book a first call with an accountant",
    ]),
    review("Spaced review", [
      "/teach quiz on book ch. 1 and 2, and on Medusa modules and workflows",
      "Redo the On-ramp explain-back from memory, then compare",
      "Share the week's summary publicly",
    ]),
    OFF,
  ],
  [
    build("Setup 1", "Setup 1 Day 1, continued: versions and toolchain", [
      "Record the OS, shell, and tool versions in docs/project-configuration.md",
      "Pin Node 24 LTS and Python 3.12, then compare with the current Medusa requirements",
      "Run nvidia-smi on the MSI laptop and confirm 30 GB of free disk",
    ], undefined, "Catch-up day: Setup 1 Day 1 slipped from Friday 2 October"),
    build("Setup 1", "Setup 1 Day 1, finish: repo, tickets, gate", [
      "git init goods, push the public GitHub repo, enable branch protection and secret scanning",
      "Run /to-tickets on Setup 1 and Setup 2 (Steps 1 to 13 get tickets from the Step 1 spec)",
      "Gate check: required commands work, main is protected, scanning is on, gitleaks finds no secrets",
    ], undefined, "Catch-up day: Setup 1 Day 1 slipped from Friday 2 October"),
    build("Setup 1", "Setup 1: scaffold Medusa", [
      "Run create-medusa-app with the Next.js starter inside goods",
      "Set MEDUSA_BACKEND_URL, the publishable key, and a region",
      "Commit the untouched generated baseline",
      "Gate check: everything starts from a clean clone using the README",
    ]),
    build("Setup 1", "Setup 1: understand, then seed", [
      "Trace one product page request from storefront to Store API",
      "Write the Medusa ADR and the current component diagram",
      "Synthetic catalog from your chosen category, plus customers and orders",
      "Make the seed repeatable, with a reset and count checks",
    ]),
    build("Setup 1", "Setup 1: Stripe test checkout", [
      "Configure the Stripe provider in test mode and verify webhooks",
      "Test decline, 3D Secure, bad signature, duplicate and delayed webhooks, refund",
      "Write docs/runbooks/local-store.md",
      "Pass the Setup 1 gate and learning gate",
    ], "Setup 1"),
    review("Spaced review", [
      "/teach quiz on book ch. 3, and on checkout and webhooks",
      "Review week 1 On-ramp notes",
      "Share the week's summary publicly",
    ]),
    OFF,
  ],
  [
    build("Setup 2", "Setup 2: containers, Compose, CI", [
      "Dockerfiles, health checks, pinned images",
      "Local Compose from empty volumes to a seeded checkout",
      "CI jobs, commit-SHA images to GHCR, pinned Actions",
      "Prove CI fails on an intentionally broken change",
    ]),
    build("Setup 2", "Setup 2: MSI laptop, then first Railway build (throwaway)", [
      "Set up the MSI laptop from a clean clone and run Ollama on the RTX 4070 (#48)",
      "Railway ADR, then a throwaway EU West project: server, worker, storefront, private Postgres and Redis",
      "Write docs/runbooks/railway.md as you go",
      "Legal track: CEIDG registration and tax form with the accountant",
    ]),
    build("Setup 2", "Setup 2: real Railway project from the runbook", [
      "Delete the throwaway project",
      "Build the real project from the runbook alone, fixing the runbook where it fell short",
      "DNS, HTTPS, single migration step, deploy trigger proven",
      "Stripe test purchase over HTTPS, then test rollback",
    ]),
    build("Setup 2", "Setup 2: backups and restore drill", [
      "Encrypted backups of all durable state to EU object storage",
      "Write-frozen restore drill into an isolated environment",
      "Write docs/runbooks/restore-all-state.md and deploy-and-rollback.md",
      "Pass the Setup 2 gate and learning gate",
    ], "Setup 2"),
    build("Step 1", "Step 1: design, journeys and data", [
      "Read the OpenAI practical guide to building agents",
      "In-scope and out-of-scope journeys",
      "Case states, transition table, and agent tables",
    ]),
    review("Spaced review", [
      "/teach quiz on book ch. 4 and 10, and on Railway security settings and restore drills",
      "Review week 1 material: Medusa concepts",
      "Share the week's summary publicly",
    ]),
    OFF,
  ],
  [
    build("Step 1", "Step 1: safety design and ADRs", [
      "Idempotency, authentication vs authorization, refund approval",
      "Failure behavior, budgets, data-flow diagram, threat model",
      "ADRs: single agent, LiteLLM boundary, Medusa API ownership, approval boundary",
      "Pass the Step 1 gate and learning gate",
    ], "Step 1"),
    build("Step 2", "Step 2: agent service and plain loop", [
      "Read \"Building effective agents\"",
      "apps/agent with FastAPI, health checks, CI",
      "LiteLLM with one hosted model and a Postgres-backed state",
      "Plain bounded loop, no framework",
      "Legal track: VAT and OSS questions with the accountant",
    ]),
    build("Step 2", "Step 2: first tools, widget, tracing", [
      "verify_customer and get_order as typed Medusa wrappers",
      "Chat widget with AI disclosure and handoff message",
      "One correlation ID end to end; redaction before tracing",
      "10 deterministic cases",
    ]),
    build("Step 2", "Step 2: baselines and deploy", [
      "tau2 retail smoke run in its own uv project",
      "Five trials per Medusa-native case; first eval report",
      "Deploy the agent next to the store",
      "Pass the Step 2 gate and learning gate",
    ], "Step 2"),
    build("Step 3", "Step 3: eval schema and checks", [
      "Read the first half of \"Demystifying evals\"",
      "Versioned eval-case schema and isolated fixtures",
      "Exact tool, ownership, argument, and final-state checks",
    ]),
    review("Spaced review", [
      "/teach quiz on book ch. 6 and 5, and on pass@5 vs pass^5",
      "Review week 2 material: checkout and webhooks",
      "Share the week's eval report summary publicly",
    ]),
    OFF,
  ],
  [
    build("Step 3", "Step 3: cases, baseline, CI", [
      "Separate infrastructure errors from agent failures",
      "At least 20 cases, weighted toward access control",
      "Baseline five times; CI in report-only mode",
      "Pass the Step 3 gate and learning gate",
    ], "Step 3"),
    build("Step 4", "Step 4: rubric and hand labels", [
      "Narrow rubric for tone, clarity, empathy, policy explanation",
      "Hand-label 30 outputs without seeing judge scores",
      "Legal track: draft the regulamin, withdrawal form, complaints process",
    ]),
    build("Step 4", "Step 4: judge calibration and CI policy", [
      "Read the rest of \"Demystifying evals\"",
      "Measure agreement, inspect disagreements, recalibrate on a held-out subset",
      "CI policy; five full runs to estimate flakiness",
      "Pass the Step 4 gate and learning gate",
      "Ask one practitioner to review the eval harness",
    ], "Step 4"),
    build("Step 5", "Step 5: versioned prompts", [
      "Separate system policy, store policy, tool descriptions, runtime context",
      "Prompts as versioned files with hashes in traces",
      "Explicit authority order; FAQ and tool output marked untrusted",
    ]),
    build("Step 5", "Step 5: injection attacks", [
      "Direct attacks: reveal prompt, ignore policy, other order, fake refund",
      "Indirect injection through product names, order notes, documents",
      "Before and after report for each prompt candidate",
      "Pass the Step 5 gate and learning gate",
    ], "Step 5"),
    review("Spaced review", [
      "/teach quiz on book ch. 5, 8, and 9, and on judge calibration",
      "Review week 3 material: Railway, restore, design doc",
      "Share the week's summary publicly",
    ]),
    OFF,
  ],
  [
    build("Step 6", "Step 6: first write tools", [
      "Read \"Writing effective tools\" and DDIA on transactions",
      "list_customer_orders",
      "request_return: policy table, tests, then the wrapper",
    ]),
    build("Step 6", "Step 6: address change and fault tests", [
      "update_shipping_address, only before fulfillment",
      "Fault tests: repeat, concurrent, timeout after accept, restart, state change",
      "Legal track: privacy policy and the list of data processors",
    ]),
    build("Step 6", "Finish Step 6, start Step 7", [
      "Pass the Step 6 gate and learning gate",
      "Canonical FAQ and policy documents for your category",
      "Chunking and metadata rules; deterministic ingestion",
    ], "Step 6"),
    build("Step 7", "Step 7: retrieval and citations", [
      "Hybrid or filtered retrieval; answers cite sources",
      "Retrieval evals: unanswerable, outdated, conflicting, injected",
    ]),
    build("Step 7", "Step 7: events and memory", [
      "Idempotent Medusa event handlers; failed-event queue",
      "Memory scoped by customer and case; isolation tests",
      "Pass the Step 7 gate and learning gate",
    ], "Step 7"),
    review("Spaced review", [
      "/teach quiz on book ch. 1 to 3 (spaced, four weeks later) and on idempotency",
      "Review week 4 material: evals and the agent loop",
      "Share the week's summary publicly",
    ]),
    OFF,
  ],
  [
    build("Step 8", "Step 8: move to LangGraph", [
      "/research recheck of the LangGraph notes",
      "Read the LangGraph persistence and interrupt docs",
      "Freeze the Step 7 baseline; model the loop as states",
      "PostgresSaver checkpointer with a stable thread_id",
    ]),
    build("Step 8", "Step 8: refund proposals and approval", [
      "propose_refund creates an approval record only",
      "Authenticated approval interface with audit trail",
      "Only one worker can claim an approved refund",
      "Legal track: product safety and labeling for your category",
    ]),
    build("Step 8", "Step 8: approval fault tests", [
      "All required approval tests across real restarts",
      "20 repeated fault runs with zero duplicate refunds",
      "Pass the Step 8 gate and learning gate",
      "Ask one practitioner to review the approval design",
    ], "Step 8", "Public holiday in Poland (Independence Day)"),
    build("Step 9", "Step 9: coverage matrix and generation", [
      "Read the Data Designer docs",
      "Coverage matrix; mark weak cells",
      "Generate candidates only for the gaps",
    ]),
    build("Step 9", "Step 9: review and dataset card", [
      "Validate, dedupe, and review every high-risk case",
      "Adversarial combinations; dataset card",
      "Full suite five times, failures grouped by cause",
      "Pass the Step 9 gate and learning gate",
    ], "Step 9"),
    review("Spaced review", [
      "/teach quiz on book ch. 4 and 10 (spaced) and on durable workflows",
      "Review week 5 material: eval cases, judge calibration, and prompts",
      "Share the week's summary publicly",
    ]),
    OFF,
  ],
  [
    build("Step 10", "Step 10: profiling", [
      "Read SRE Handling Overload",
      "/research recheck of the NeMo Agent Toolkit notes",
      "Freeze the Step 9 report; profile traces by step",
      "NeMo Agent Toolkit as a second profiler",
    ]),
    build("Step 10", "Step 10: one optimization at a time", [
      "Rank opportunities by savings and risk",
      "Test each optimization with five full runs",
      "Legal track: check open items with the accountant and lawyer",
    ]),
    build("Step 10", "Step 10: overload controls", [
      "Admission control, deadlines, bounded queues, backoff with jitter",
      "Budget and capacity exhaustion fall back to handoff",
      "Pass the Step 10 gate and learning gate",
    ], "Step 10"),
    build("Step 11", "Step 11: guardrails", [
      "/research recheck of the NeMo Guardrails notes",
      "Read the NeMo Guardrails docs",
      "Input, retrieval, execution, and output rails",
    ]),
    build("Step 11", "Step 11: attacks and over-blocking", [
      "Obfuscation, multilingual, role-play, canary secrets",
      "Writes fail closed when rails are unavailable",
      "Rerun functional evals for over-blocking",
      "Pass the Step 11 gate and learning gate",
    ], "Step 11"),
    review("Spaced review", [
      "/teach quiz on book ch. 6 and 5 (spaced) and on guardrails",
      "Review week 6 material: write tools and RAG",
      "Share the week's summary publicly",
    ]),
    OFF,
  ],
  [
    build("Step 12", "Step 12: dashboard and operational controls", [
      "Read DDIA on consistency and derived data",
      "Dashboard of the headline metrics",
      "Alerts, redaction tests, rate limits, write kill switch, runbooks",
    ]),
    build("Step 12", "Step 12: fault campaign", [
      "Define expected behavior before each fault",
      "Kill the worker 20 times; restart Postgres and Redis",
      "Inject timeouts, malformed output, duplicate events",
    ]),
    build("Step 12", "Step 12: recovery drills", [
      "Restore the latest backup and record recovery time",
      "Full deploy and rollback drill",
      "Pass the Step 12 gate and learning gate",
    ], "Step 12"),
    build("Step 13", "Step 13: release candidate and security review", [
      "Stop feature work; triage every open issue",
      "Full test and eval run from a clean clone",
      "Secrets scan, synthetic data check, kill switch test",
    ]),
    build("Step 13", "Step 13: reproducibility", [
      "Final backup and isolated restore of all durable state",
      "Final deploy and rollback; check every runbook",
      "Freeze dataset, prompts, config, and final report",
    ]),
    review("Spaced review", [
      "/teach quiz on book ch. 8 and 9 (spaced) and on the fault campaign",
      "Review week 7 material: LangGraph and approvals",
      "Share the week's summary publicly",
    ]),
    OFF,
  ],
  [
    build("Step 13", "Step 13: write the case study", [
      "\"An e-commerce support agent, with numbers\"",
      "Three important failures and the tests they created",
      "Limitations and next experiments",
    ]),
    build("Step 13", "Step 13: publish", [
      "License check, make the repo public, versioned release",
      "Publish the post and verify every link logged out",
      "Give the 20-minute walkthrough to someone else",
      "Check the Definition of complete",
    ], "Step 13"),
    review("Retro", [
      "Hours actually worked, energy, which learning gates were hard",
      "What stuck on spaced review",
      "Choose the pace for the second project: catalog enrichment",
    ]),
  ],
];

const START = new Date(2026, 8, 28);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function dateFor(week: number, day: number): Date {
  return new Date(START.getFullYear(), START.getMonth(), START.getDate() + week * 7 + day);
}

function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function longLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function shortLabel(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function hours(kind: Kind): string {
  if (kind === "build") return "10:00 to 18:00";
  if (kind === "review") return "10:00 to 12:30";
  return "Rest";
}

type Slot = { week: number; day: number; key: string; date: Date; plan: Day };

const SLOTS: Slot[] = WEEKS.flatMap((days, week) =>
  days.map((plan, day) => {
    const date = dateFor(week, day);
    return { week, day, key: iso(date), date, plan };
  }),
);

const LEARN: Record<string, string> = {
  "2026-09-28": "Set up /teach in learning/ with the mission",
  "2026-09-29": "Book ch. 1, day 1 of 2: Planning AI Applications",
  "2026-09-30": "Book ch. 1, day 2 of 2: The AI Engineering Stack",
  "2026-10-01": "Book ch. 2, day 1 of 2: Sampling, Structured Outputs",
  "2026-10-02": "Book ch. 2, day 2 of 2: The Probabilistic Nature of AI; skim training and modeling",
  "2026-10-07": "Book ch. 3, day 1 of 3: challenges; skim language modeling metrics",
  "2026-10-08": "Book ch. 3, day 2 of 3: Exact Evaluation",
  "2026-10-09": "Book ch. 3, day 3 of 3: AI as a Judge; Comparative Evaluation",
  "2026-10-12": "Book ch. 4, day 1 of 3: Evaluation Criteria",
  "2026-10-13": "Book ch. 4, day 2 of 3: Model Selection",
  "2026-10-14": "Book ch. 4, day 3 of 3: Design Your Evaluation Pipeline",
  "2026-10-15": "Book ch. 10, day 1 of 3: architecture steps 1 to 3 (context, guardrails, router and gateway)",
  "2026-10-16": "Book ch. 10, day 2 of 3: steps 4 and 5 (caches, agent patterns); Monitoring and Observability",
  "2026-10-19": "Book ch. 10, day 3 of 3: Pipeline Orchestration; User Feedback",
  "2026-10-20": "Book ch. 6, day 1 of 3: Agents overview, Tools, Planning",
  "2026-10-21": "Book ch. 6, day 2 of 3: Agent Failure Modes and Evaluation; Memory",
  "2026-10-22": "Book ch. 6, day 3 of 3: RAG architecture, retrieval algorithms and optimization",
  "2026-10-23": "Book ch. 5, day 1 of 3: Introduction to Prompting",
  "2026-10-26": "Book ch. 5, day 2 of 3: best practices; Organize and Version Prompts",
  "2026-10-27": "Book ch. 5, day 3 of 3: Defensive Prompt Engineering",
  "2026-10-28": "Book ch. 8, day 1 of 2: Data Curation (quality, coverage, annotation)",
  "2026-10-29": "Book ch. 8, day 2 of 2: Data Synthesis; Data Processing and deduplication",
  "2026-10-30": "Book ch. 9, day 1 of 2: Inference Overview and Performance Metrics",
  "2026-11-02": "Book ch. 9, day 2 of 2: Inference Service Optimization; skim model optimization",
  "2026-11-03": "Book ch. 7, day 1 of 2: When to Finetune; Finetuning and RAG",
  "2026-11-04": "Book ch. 7, day 2 of 2: skim memory bottlenecks and techniques",
  "2026-11-05": "Second read: ch. 6 RAG, for retrieval",
  "2026-11-06": "Second read: ch. 6 Memory, for events and memory",
  "2026-11-09": "Second read: ch. 6 Planning, for the LangGraph move",
  "2026-11-10": "Second read: ch. 6 Agent Failure Modes, for approvals",
  "2026-11-11": "Second read: ch. 6 Agent Evaluation, for approval fault tests",
  "2026-11-12": "Second read: ch. 8 Data Augmentation and Synthesis",
  "2026-11-13": "Second read: ch. 8 Data Processing",
  "2026-11-16": "Second read: ch. 9 Inference Performance Metrics",
  "2026-11-17": "Second read: ch. 9 Inference Service Optimization",
  "2026-11-18": "Second read: ch. 10 router, gateway, and caches",
  "2026-11-19": "Second read: ch. 10 Put in Guardrails",
  "2026-11-20": "Second read: ch. 5 Defensive Prompt Engineering",
  "2026-11-23": "Second read: ch. 10 Monitoring and Observability",
  "2026-11-24": "Second read: ch. 10 AI Pipeline Orchestration",
  "2026-11-25": "Second read: ch. 10 User Feedback",
  "2026-11-26": "Review: chapter summaries 1 to 5",
  "2026-11-27": "Review: chapter summaries 6 to 10",
  "2026-11-30": "Review: your explain-backs, for the case study",
  "2026-12-01": "Rehearse the 20-minute walkthrough",
};

type Item = { id: string; text: string };
type Blocks = { learn?: Item; apply: Item[]; consolidate?: Item };

function blocksFor(slot: Slot): Blocks {
  const apply = slot.plan.tasks.map((text, i) => ({ id: `${slot.key}#${i}`, text }));
  if (slot.plan.kind !== "build") return { apply };
  const reading = LEARN[slot.key];
  return {
    learn: reading ? { id: `${slot.key}#learn`, text: reading } : undefined,
    apply,
    consolidate: {
      id: `${slot.key}#consolidate`,
      text:
        slot.day === 4
          ? "Explain-back for today's reading, then the weekly progress note"
          : "Explain-back: today's concepts and where they showed up in the code",
    },
  };
}

function itemsFor(slot: Slot): Item[] {
  const b = blocksFor(slot);
  return [...(b.learn ? [b.learn] : []), ...b.apply, ...(b.consolidate ? [b.consolidate] : [])];
}

function findToday(): Slot {
  const today = iso(new Date());
  const exact = SLOTS.find((s) => s.key === today);
  if (exact) return exact;
  if (today < SLOTS[0].key) return SLOTS[0];
  return SLOTS[SLOTS.length - 1];
}

function DayPlan({
  slot,
  done,
  toggle,
}: {
  slot: Slot;
  done: Record<string, boolean>;
  toggle: (id: string, value: boolean) => void;
}) {
  const theme = useHostTheme();
  const { plan } = slot;
  if (plan.kind === "off") {
    return <Text tone="secondary">Sunday off. No building, no review.</Text>;
  }
  const blocks = blocksFor(slot);
  const check = (item: Item) => (
    <Checkbox
      key={item.id}
      checked={!!done[item.id]}
      onChange={(v) => toggle(item.id, v)}
      label={
        <span style={{ color: done[item.id] ? theme.text.tertiary : theme.text.primary }}>{item.text}</span>
      }
    />
  );
  const block = (time: string, name: string, items: Item[]) => (
    <Stack gap={6}>
      <Text size="small" tone="tertiary" weight="medium">{`${time}  ${name}`}</Text>
      <Stack gap={8}>{items.map(check)}</Stack>
    </Stack>
  );
  return (
    <Stack gap={12}>
      <H3>{plan.title}</H3>
      {plan.note ? (
        <Text size="small" tone="secondary">
          {plan.note}
        </Text>
      ) : null}
      {plan.kind === "build" ? (
        <>
          {blocks.learn ? block("10:00 to 11:30", "Learn", [blocks.learn]) : null}
          {block(blocks.learn ? "11:30 to 17:00" : "10:00 to 17:00", "Apply", blocks.apply)}
          {blocks.consolidate ? block("17:00 to 18:00", "Consolidate", [blocks.consolidate]) : null}
        </>
      ) : (
        block("10:00 to 12:30", plan.label === "Retro" ? "Retro" : "Spaced review", blocks.apply)
      )}
      {plan.gate ? (
        <Text size="small" weight="semibold" style={{ color: theme.accent.primary }}>
          {`Gate day: ${plan.gate} gate and learning gate`}
        </Text>
      ) : null}
    </Stack>
  );
}

function Overview({
  selected,
  todayKey,
  onSelect,
  done,
}: {
  selected: string;
  todayKey: string;
  onSelect: (key: string) => void;
  done: Record<string, boolean>;
}) {
  const theme = useHostTheme();
  const cell = {
    border: `1px solid ${theme.stroke.tertiary}`,
    borderRadius: 4,
    padding: "6px 8px",
    minHeight: 52,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))", gap: 4 }}>
      <div />
      {WEEKDAYS.map((w) => (
        <Text key={w} size="small" tone="tertiary" style={{ paddingLeft: 8 }}>
          {w}
        </Text>
      ))}
      {WEEKS.map((days, week) => [
        <div key={`w${week}`} style={{ display: "flex", alignItems: "center" }}>
          <Text size="small" tone="secondary">{`Week ${week + 1}`}</Text>
        </div>,
        ...days.map((plan, day) => {
          const slot = SLOTS[week * 7 + day];
          const isSelected = slot.key === selected;
          const isToday = slot.key === todayKey;
          const items = itemsFor(slot);
          const complete = items.length > 0 && items.every((it) => done[it.id]);
          return (
            <div
              key={slot.key}
              onClick={() => onSelect(slot.key)}
              style={{
                ...cell,
                background: isSelected ? theme.fill.secondary : "transparent",
                borderColor: isToday ? theme.accent.primary : theme.stroke.tertiary,
              }}
            >
              <Row gap={4} align="center">
                <Text size="small" tone={plan.kind === "off" ? "quaternary" : "tertiary"}>
                  {shortLabel(slot.date)}
                </Text>
                <Spacer />
                {plan.gate ? (
                  <span style={{ fontSize: 10, color: theme.accent.primary }}>Gate</span>
                ) : null}
              </Row>
              <Text
                size="small"
                weight={plan.kind === "build" ? "medium" : "normal"}
                tone={plan.kind === "off" ? "quaternary" : complete ? "tertiary" : "primary"}
                truncate
              >
                {complete ? `${plan.label} done` : plan.label}
              </Text>
            </div>
          );
        }),
      ])}
    </div>
  );
}

export default function CoreRoadmapCalendar() {
  const dispatch = useCanvasAction();
  const today = useMemo(findToday, []);
  const [selected, setSelected] = useState(today.key);
  const [done, setDone] = useCanvasState<Record<string, boolean>>("done", {});

  const toggle = (id: string, value: boolean) => setDone((prev) => ({ ...prev, [id]: value }));
  const selectedSlot = SLOTS.find((s) => s.key === selected) ?? today;

  const allItems = SLOTS.flatMap(itemsFor);
  const totalTasks = allItems.length;
  const doneTasks = allItems.filter((it) => done[it.id]).length;
  const readingItems = SLOTS.flatMap((s) => {
    const learn = blocksFor(s).learn;
    return learn && learn.text.startsWith("Book ch.") ? [learn] : [];
  });
  const readingDone = readingItems.filter((it) => done[it.id]).length;
  const gatesPassed = SLOTS.filter((s) => s.plan.gate && itemsFor(s).every((it) => done[it.id])).length;
  const gatesTotal = SLOTS.filter((s) => s.plan.gate).length;
  const isRealToday = iso(new Date()) === today.key;

  return (
    <Stack gap={20}>
      <Stack gap={6}>
        <H1>Core roadmap calendar: ten-week plan</H1>
        <Text tone="secondary">
          28 September to 2 December 2026, shifted two build days after Setup 1 Day 1 slipped. Build days Monday to Friday: learn 10:00 to 11:30, apply
          11:30 to 17:00, consolidate 17:00 to 18:00. Saturday is light review, 10:00 to 12:30. Sunday
          is off.
        </Text>
      </Stack>

      <Grid columns="minmax(0, 3fr) minmax(0, 2fr)" gap={20} align="start">
        <Stack gap={16}>
          <Card size="lg">
            <CardHeader trailing={hours(today.plan.kind)}>
              {`${isRealToday ? "Today" : "Next up"}: ${longLabel(today.date)}`}
            </CardHeader>
            <CardBody>
              <DayPlan slot={today} done={done} toggle={toggle} />
            </CardBody>
          </Card>

          <Stack gap={8}>
            <H2>Ten weeks at a glance</H2>
            <Text size="small" tone="tertiary">
              Click a day to see its plan. The outlined cell is today. "Gate" marks the day a step
              must pass its gate and learning gate.
            </Text>
            <Overview selected={selected} todayKey={today.key} onSelect={setSelected} done={done} />
          </Stack>
        </Stack>

        <Stack gap={16}>
          <Row gap={24}>
            <Stat value={`${doneTasks} / ${totalTasks}`} label="Tasks done" />
            <Stat value={`${readingDone} / ${readingItems.length}`} label="Book reading days" />
            <Stat value={`${gatesPassed} / ${gatesTotal}`} label="Gate days completed" />
          </Row>

          <Card>
            <CardHeader trailing={<Pill size="sm">{selectedSlot.plan.label}</Pill>}>
              {`${longLabel(selectedSlot.date)}, ${hours(selectedSlot.plan.kind)}`}
            </CardHeader>
            <CardBody>
              <DayPlan slot={selectedSlot} done={done} toggle={toggle} />
            </CardBody>
          </Card>

          <Divider />

          <Callout tone="info" title="The gates drive the dates, not the calendar">
            If a gate doesn't pass on its day, keep working on it and shift the rest of the calendar.
            Never skip a gate to stay on schedule.
          </Callout>

          <Row gap={8} wrap>
            <Button variant="primary" onClick={() => dispatch({ type: "openFile", path: PROMPTS })}>
              Open research prompts
            </Button>
            <Button variant="secondary" onClick={() => dispatch({ type: "openFile", path: ROADMAP })}>
              Open roadmap
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                dispatch({
                  type: "newComposerChat",
                  userPrompt:
                    "A gate slipped. Shift the remaining days in this calendar and in the roadmap schedule table.",
                })
              }
            >
              Shift the calendar
            </Button>
          </Row>
        </Stack>
      </Grid>
    </Stack>
  );
}
