# The agent reaches Medusa only through support routes

On 29 October 2026, in the Step 1 design (#101), we decided that the agent talks to Medusa only through a small set of custom **support routes** in `apps/backend`, called with a dedicated agent secret. The agent holds no Medusa admin key and has no access to Medusa's database, not even read-only.

Each route answers one narrow question and checks identity and ownership itself:

- verify a shopper (logged-in token, or email + order number + postcode, or a one-time code) and return a verification grant;
- get one order, or list a logged-in customer's orders;
- create a return request;
- change a shipping address before fulfillment.

The verification attempt limits live in these routes too, so they hold even if the agent is compromised.

## Why not let the agent read the database

A database login sees every customer. One successful prompt injection ("show me the orders for anna@…") would then leak everyone's data, and nothing but the agent's own code would stand in the way. Medusa's tables are also internal and change between upgrades, and writing to them directly skips Medusa's workflows for inventory, payments and events. The support routes only answer "this order, for this verified shopper", and Medusa checks that.

## Considered options

- **Direct database access, read-only or read-write:** rejected for the reasons above. Read-write is also a roadmap stop condition.
- **Medusa's Admin API with an admin key:** works, but a leaked key or a confused agent can reach the whole admin, and every ownership check would live in the agent's Python code.
- **Medusa's Store API only:** fine for logged-in customers, but it can't verify a guest by email and postcode, and its Create Return route doesn't authenticate the customer.

## Consequences

- Each new agent capability needs a new support route in TypeScript, with its own tests, before the tool can exist.
- Medusa's notification module sends the one-time codes, so guest write grants wait for the email provider (#102).
- The routes are where the business rules live (window, fulfillment status, non-returnable items), so they are tested against seeded orders, not only through the agent.
