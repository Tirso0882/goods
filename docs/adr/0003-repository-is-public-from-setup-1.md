# The repository is public from Setup 1

The roadmap says to keep the repository private until secret scanning, the license, and a publication review are complete. We made `goods` public on 6 October 2026, during Setup 1 Day 1, instead. On GitHub Free, branch protection and rulesets only work on public repositories, and the roadmap needs a protected `main` from day one. Public evidence is also the second priority of the roadmap, so working in the open costs nothing we would not publish later anyway.

The private-until-reviewed rule is replaced by checks that run before and after every push:

- GitHub secret scanning and push protection are enabled.
- The full git history is scanned with `gitleaks git` before the Setup 1 Day 1 gate, and again at every gate. Known false positives are listed by fingerprint in `.gitleaksignore`, never by disabling a rule.
- The MIT license is in the repository root.
- The repository, its issues and its fixtures hold only synthetic data and test-mode credentials, as the README says.

## Consequences

- Everything pushed is public immediately, including issues, progress notes and ADRs. The publication review happens on each pull request, not once before going public.
- If a secret reaches git history, rotate it before doing anything else. Rewriting history does not help once a public commit may have been cloned.
- The Setup 1 Day 1 gate checks that the repository is protected and scanned, not that it is private.
