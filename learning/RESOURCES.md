# Production Support Agent on Medusa: Resources

## Knowledge

### Medusa
- [Medusa docs: Build Custom Features tutorial](https://docs.medusajs.com/learn/customization/custom-features)
  The On-ramp's main text: module, workflow, and API route for a "brand" feature. The roadmap's old `/learn/customization` link returns 404 (checked 1 Oct 2026); this is its replacement. Use for: every On-ramp lesson.
- [Medusa docs: Architecture](https://docs.medusajs.com/learn/introduction/architecture)
  How the application, modules, workflows, and API routes fit together. Use for: component maps and "which part owns this data".
- [Medusa docs: API Routes](https://docs.medusajs.com/learn/fundamentals/api-routes) and [API route validation](https://docs.medusajs.com/learn/fundamentals/api-routes/validation)
  File-based routing, handler exports, Zod validation middleware. Use for: reading and writing routes, debugging 400 errors from the agent's tools.
- [Medusa docs: Workflows](https://docs.medusajs.com/learn/fundamentals/workflows)
  Steps, compensation, durable execution. Use for: the On-ramp learning gate and the return flow.
- [Medusa docs: Medusa container](https://docs.medusajs.com/learn/fundamentals/medusa-container)
  What `req.scope` is and how services are resolved. Use for: understanding route handlers and workflows.
- [Medusa docs: Modules](https://docs.medusajs.com/learn/fundamentals/modules), [Data Model Properties](https://docs.medusajs.com/learn/fundamentals/data-models/properties), [Service Factory](https://docs.medusajs.com/learn/fundamentals/modules/service-factory)
  Module structure, column types, generated CRUD methods. Use for: writing custom modules.
- [Medusa docs: Module Isolation](https://docs.medusajs.com/learn/fundamentals/modules/isolation)
  Why modules can't call each other, and the three ways around it (module links, Query, workflows). Use for: data ownership in the Step 1 design doc, and as the bridge to workflows.
- [Medusa docs index for LLMs](https://docs.medusajs.com/llms.txt)
  Full page list. Use for: finding pages when links move.

### TypeScript and JavaScript
- [TypeScript Handbook: Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html)
  Annotations, type aliases, interfaces, unions. Use for: reading any Medusa type signature.
- [TypeScript Handbook: The Basics, Erased Types](https://www.typescriptlang.org/docs/handbook/2/basic-types.html#erased-types)
  Why types do not exist at runtime. Use for: why Medusa needs Zod.
- [TypeScript Handbook: Generics](https://www.typescriptlang.org/docs/handbook/2/generics.html) and [Modules](https://www.typescriptlang.org/docs/handbook/2/modules.html)
  `Type<Arg>` syntax, `import type`. Use for: `MedusaRequest<Body>`, workflow types.
- [MDN JavaScript reference](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference)
  The authority on runtime JavaScript: destructuring, arrow functions, async functions, imports. Use for: anything the TypeScript handbook assumes you know.
- [TypeScript Playground](https://www.typescriptlang.org/play)
  Run and type-check snippets in the browser. Use for: exercises without a local project.
- [Zod](https://zod.dev/basics)
  Runtime schema validation with `z.infer` for static types. Use for: Medusa validators.
- [Pydantic](https://docs.pydantic.dev/latest/)
  Python counterpart to Zod. Use for: the agent service's tool argument validation.

### Agent engineering
- Chip Huyen, *AI Engineering* ([table of contents](https://github.com/chiphuyen/aie-book/blob/main/ToC.md))
  Main textbook, read in the order set by the roadmap's book reading track.
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
  When to use workflows versus agents, and simple agent loop patterns. Use for: Steps 1 and 2.
- The rest of the roadmap's reading list (evals guide, tools guide, tau-bench, DDIA, SRE book) is added here as each step starts.

### Operations
- [Medusa deployment guide](https://docs.medusajs.com/learn/deployment/general)
  Server and worker modes, production modules. Use for: Setup 2.
- [Medusa installation](https://docs.medusajs.com/learn/installation)
  Current requirements and `create-medusa-app`. Use for: Setup 1.

## Wisdom (Communities)

The learner prefers to work solo. Do not propose communities unless asked. The roadmap's "outside feedback" item (one practitioner reviewing the eval harness in Step 4) is the one planned exception, and it is the learner's call.

## Gaps
- No trusted "TypeScript for Python developers" guide found yet. The lessons bridge from Python directly, citing the TypeScript Handbook and MDN.
