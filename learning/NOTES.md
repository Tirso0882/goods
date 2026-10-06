# Notes

## Learner preferences
- Plain, natural language. Never use em dash or en dash characters in lessons, references, or notes.
- Comfortable in Python (not production depth). Bridge every TypeScript idea from a Python equivalent.
- Wants all three tracks: Huyen chapters, Node and Medusa, VPS operations, in roadmap order.
- Prefers solo learning. No community suggestions.

## Working notes
- Lessons should fit the 10:00 to 11:30 learning block, and end with an explain-back the learner can reuse in the weekly progress note (`docs/progress/week-XX.md`).
- Roadmap position on 1 Oct 2026: week 1, On-ramp (Medusa customization in TypeScript). Book reading track says ch. 2 on 1 to 2 Oct.
- On-ramp gate: a throwaway Medusa project runs a custom module, route, workflow, and subscriber. Learning gate: why a workflow is safer than a plain route for a multi-step change like a return.
- `GLOSSARY.md` not created yet: add terms only once the learner can use them correctly.
- Planned lesson sequence for the On-ramp: (1) read a Medusa API route, (2) modules and the container, (3) workflows, steps, and compensation, (4) subscribers and scheduled jobs. Adjust based on explain-backs.
- Lessons 1 and 2 delivered (1 and 2 Oct). Explain-backs for both still pending, so no evidence-based learning records yet.
- Lesson 2 uses a "Guide" module (sizing, care, compatibility guides) as the running example. Lesson 3 should reuse it: a `createGuideWorkflow` with compensation fills the empty `/guides` route, then contrast with a multi-module return.
- `onramp-sandbox` exists (built by the agent on 2 Oct at the learner's request, not by hand): `~/Documents/projects/onramp-sandbox`, Medusa 2.21.2. The current template is a monorepo, so the backend is `apps/backend/` (lessons should say so). Postgres runs in Docker container `onramp-postgres` (start Docker Desktop, then `docker start onramp-postgres`), database `onramp_sandbox`. Guide module, migration, and `GET /guides` work and return `{"guides":[]}`. Gate progress: module and route done; workflow and subscriber still to do.
- Lessons 3 and 4 delivered 2 Oct, plus `reference/four-layers.html` (one `POST /guides` traced through all layers), at the learner's request. All their code was written into the sandbox and run by the agent first (validation 400, success 200, simulated failure 400 with the row compensated away, subscriber fires only on success, a throwing subscriber doesn't fail the request, job logs every minute). So the sandbox already holds the finished files, and the hands-on in Lessons 3 and 4 is "predict, run, break, extend" rather than "type it in". The gate counts once the learner has done the extension tasks (`fillSummaryStep`, second subscriber) themselves. Ask before assuming.
- The learner asked "where is the workflow, the business logic?" right after Lesson 2. So they hold the layer model, and the gap was only that the workflow layer hadn't been taught yet. No other evidence yet: still no explain-backs for any lesson.
- Each lesson's quiz ends with two retrieval questions from earlier lessons (spacing). Keep doing this.
- Reference sheets: `typescript-for-python-devs.html` (syntax only), `medusa-building-blocks.html` (routes, modules, container, isolation). Medusa anatomy goes in the second, not the first.
