# goods

A learning project: building a production-grade customer support agent for a Medusa e-commerce store, to become a strong AI agent engineer. The store is the vehicle, not the goal.

## Language

### Plan

**Core roadmap**:
The gate-driven plan that builds the support agent, from product research to the published case study.
_Avoid_: 13-week plan, the course

**Step**:
One unit of the core roadmap's detailed plan (Research, On-ramp, Setup 1 and 2, Steps 1 to 16), with its own gate and learning gate.
_Avoid_: Module, milestone, lesson

**Week**:
Forty project hours, Monday to Friday 10:00 to 18:00, plus a light review day on Saturday and Sunday off. Steps run back to back and can cross week boundaries.
_Avoid_: Sprint, phase

**Second project**:
A new AI feature for the store, chosen from the features list, started only after the core roadmap's definition of complete passes.
_Avoid_: Phase 2, extension

### Roadmap checks

**Gate**:
A mandatory check at the end of a step that must pass, with committed evidence, before the next step starts.
_Avoid_: Done when, do not continue if, exit criteria

**Learning gate**:
The part of a gate that checks the learner, not the system: a stored model answer to the step's core concepts, read by the learner, and on a deep-stop step also explained back without notes.
_Avoid_: Quiz, knowledge check

**Deep stop**:
A step whose learning gate is also explained back without notes, kept for the core AI engineering topics: evals, idempotency, RAG, synthetic data and multi-agent design.
_Avoid_: Checkpoint, deep dive

**Stop condition**:
A violated safety or data invariant that halts all feature work, at any point, until it is fixed.
_Avoid_: Blocker, red flag

**Definition of complete**:
The gate for the whole roadmap.
_Avoid_: Final checklist, done

### Support

**Shopper**:
A person, guest or logged-in, who talks to the support agent through the storefront chat.
_Avoid_: User, client

**Operator**:
The store owner, who approves or rejects proposals and takes handoffs, but never chats with the support agent.
_Avoid_: Admin, approver, human agent

**Support case**:
One chat conversation with a shopper. It can cover several orders and requests, and it ends on resolution, handoff, or a day without activity.
_Avoid_: Ticket, session, thread

**Verification grant**:
Short-lived proof, issued by the store, that a shopper may read, or also change, one order or all of their own orders within one support case.
_Avoid_: Session, login, verified flag

**Handoff**:
Passing a support case to the operator, who answers the shopper outside the chat.
_Avoid_: Escalation (that is the metric, not the act), transfer

**Return request**:
A shopper's request, created in the store by the support agent, to send items back within the withdrawal window. The refund that completes it is the operator's action, never the agent's.
_Avoid_: Return (alone), RMA

**Exception refund**:
A refund not tied to a received return, such as for a missing or damaged item. The support agent only proposes it, and it runs only after the operator approves.
_Avoid_: Goodwill refund, autonomous refund

**Non-returnable item**:
A product excluded from the withdrawal right, such as unsealed pierced earrings or engraved pieces. The support agent never decides this, it hands the case off.
_Avoid_: Final sale

### Learning artifacts

**Explain-back**:
A section of the weekly progress note that explains, in your own words, a concept as it showed up in this project's code.
_Avoid_: Learning log, notes, reflection
