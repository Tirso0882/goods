# Voice and fine-tuning leave the roadmap

On 7 November 2026 we removed Step 14 (voice in the storefront chat, with a phone-line assessment) and Step 15 (fine-tuning a small model) from the core roadmap. This amends ADR 0004, which brought them in on 7 October 2026. The multi-agent experiment (Step 13) stays. The old Step 16, close gaps and publish, becomes Step 14.

The store has no shopper who needs voice yet, and no narrow task where a fine-tuned model has beaten prompting. Each step took five build days and added a processor (a speech provider) or a production serving problem (no GPU) without moving the support agent's core numbers. The time goes back to evals, safe writes and RAG, and the core roadmap ends about two and a half weeks earlier, in mid-January 2027.

## Considered options

- **Keep both as experiments (ADR 0004):** good for the skills map, but each one is a week of work for a skill the store doesn't use yet.
- **Keep one of them:** fine-tuning is the cheaper of the two, but its only candidate tasks (intent routing, the Step 10 cheap model) already have cheaper answers: prompting and a smaller hosted model.

## Consequences

- Either one comes back only as a second project, through `/grill-with-docs` and `/to-spec`, when the store gives it a real use.
- No speech provider joins the processor list, and no transcripts or audio need retention rules.
- The book reading track drops the full read of ch. 7 and the voice second read of ch. 9. Ch. 7's "When to Finetune" and "Finetuning and RAG" are still read, for the Step 7 ADR.
- Nemotron Nano stays on the laptop, for cheap local eval loops, not for fine-tuning.
- Step 13 stays an experiment against the Step 12 baseline. It is not the template's default architecture, and the back-office agents (catalog, marketing, operations) are separate jobs that need no supervisor.
