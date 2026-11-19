# Visual check runbook

What to look at in the shop, by eye, before merging a pull request. CI proves the code. This proves the shop still works the way a shopper and the operator see it: on the pull request's branch, in the Compose stack, which runs the production images ([compose-stack.md](compose-stack.md)).

Every pull request gets the [baseline walk](#baseline-walk). Add the [area checks](#area-checks) for what its diff touches, then work through its own **Not verified** list. Tick a box only for what you saw work.

## Set up

Check the branch out next to your checkout, so a factory run in progress keeps its files:

```bash
git fetch origin
git worktree add ../goods-review origin/<branch>   # sandcastle/issue-<n> for a factory pull request
cp .env ../goods-review/
cd ../goods-review
docker compose up -d --build --wait
docker compose run --rm medusa-seed                # only on empty volumes
```

For the checkout steps, start `stripe listen` as in [Stripe test checkout](compose-stack.md#stripe-test-checkout).

In Chrome, open http://localhost:8000/pl with DevTools on the Console, and on the Network tab with **Preserve log** ticked. A private window is a new shopper, with no cart and no chat cookie. For phone size, use the device toolbar (Ctrl+Shift+M) at 390 px wide. Admin is http://localhost:9000/app, with the admin user from [First run](compose-stack.md#first-run).

When you're done:

```bash
cd -
git worktree remove --force ../goods-review
docker compose up -d --build --wait                # back to main's images
```

After a pull request with a migration, [reset to a fresh store](compose-stack.md#reset-to-a-fresh-store) as well: `main` shouldn't run on a database migrated ahead of it.

## Baseline walk

About 15 minutes. Do all of it, even for a change that looks unrelated: it catches what a change breaks somewhere else.

1. **Home** (`/pl`): the header has the store link, **Search products**, **Account** and **Cart (0)**. The hero still says "Ecommerce Starter Template". That text comes from the starter and isn't a regression.
2. **Store** (`/pl/store`): 16 products, each with its image and a price such as `PLN 119.00`.
3. **Categories**: `/pl/categories/rings` lists the 5 rings and nothing else. Earrings has 4, necklaces 4, bracelets 3.
4. **Search**: type "moissanite" in **Search products**. The results are matching products, and a result opens its page.
5. **Product**: open a ring with **Metal** and **Ring size**.
   - The button says **Select variant** until every option is chosen, then **Add to cart**.
   - After you add the ring, you stay on the page and the cart count goes up.
   - The cart dropdown opens for a few seconds with the item and its options.
6. **Cart** (`/pl/cart`): the item shows its options. Changing the quantity updates the line and the totals. Removing the item empties the cart.
7. **Totals**, in the cart and at checkout: **Total** is the product prices plus the delivery you picked, VAT included.
   - For example, a ring at `PLN 119.00` with Standard Shipping costs `PLN 119.00` + `PLN 15.00` = `PLN 134.00`.
   - The lines above it are net of VAT: Subtotal `PLN 96.75`, Shipping `PLN 12.20`, Taxes `PLN 25.06`. Shipping reads `PLN 12.20` here and `PLN 15.00` in the delivery step, and both are right.
   - A Total above `PLN 134.00` means VAT was added on top.
8. **Checkout**: use an `@example.com` email and a made-up Polish address. Poland is the only country on offer.
   - Delivery offers **Standard Shipping** (`PLN 15.00`) and **Express Courier** (`PLN 25.00`).
   - Pay by **Credit card** with `4242 4242 4242 4242`, any future date and any CVC.
9. **Confirmation**: the page shows "Thank you!" and "Your order was placed successfully." It lists the order number, the items, the delivery and the payment. The cart count is back to 0.
10. **Admin**: under **Orders**, the new order is at the top with its customer, items and total. Its payment is **Captured** and its fulfillment **Not fulfilled**. `stripe listen` shows the `payment_intent.*` events with `[200]`.
11. **Chat**: the chat button sits at the bottom right of every page except checkout. Open it, send "Where is my order?" and wait for the reply. After a reload, the conversation is still there.
12. **Phone width** (390 px): check home, a product, the cart and checkout.
    - Nothing is cut off, and nothing scrolls sideways.
    - The cart stays in the header, and the buttons are big enough to tap.
    - The chat button covers neither **Add to cart** nor the checkout buttons.
13. **Services**: every service is healthy, and the walk left no new errors in the logs:

    ```bash
    docker compose ps
    docker compose logs --since 20m storefront medusa-server medusa-worker agent | grep -iE "error|exception|unhandled"
    ```

On every page:

- The Console shows no red errors and no hydration warnings.
- The Network tab shows no failed request you can't explain.
- No page shows `undefined`, `NaN`, `null`, a broken image or an emoji.

## Area checks

`gh pr diff <pr> --name-only` lists the files a pull request touches. Add each section whose paths it touches.

### Product pages and listings

`apps/storefront/src/modules/products`, `store`, `categories`, `collections`

- Try every option of two products: the price and the images change with the choice.
- Check the image gallery, and the related products under the product.
- An unknown product shows the 404 page: http://localhost:8000/pl/products/does-not-exist.
- Product names and prices must still be in the HTML the server sends, for search engines and AI agents ([ADR 0007](../adr/0007-one-discoverability-layer-for-search-engines-and-ai-agents.md)). This prints the prices:

  ```bash
  curl -s localhost:8000/pl/categories/rings | grep -o "PLN [0-9.,]*" | sort -u
  ```

### Cart, checkout and payments

`apps/storefront/src/modules/cart`, `checkout`, `app/api/payment-return`, and the payment code in `apps/backend`

- A declined card (`4000 0000 0000 0002`) shows an error the shopper can read. No order is created, and the cart stays.
- 3D Secure (`4000 0027 6000 3184`): complete the challenge on one order and fail it on another.
- **Express Courier** raises the total by `PLN 25.00`.
- After a refund from the order in Admin, Admin shows **Refunded** and the Stripe Dashboard (test mode) shows the refund.
- What was seen the last time: [local-store.md](local-store.md#purchase) and [stripe-failure-paths.md](../verification/stripe-failure-paths.md).

### Account

`apps/storefront/src/modules/account`, `app/[countryCode]/(main)/account`

- Register with a new `@example.com` email, log out and log back in.
- Edit the profile. Add, edit and delete an address.
- **Orders** lists an order you placed while logged in, and its page shows the same items and total.

### Layout

`apps/storefront/src/modules/layout`, `common`

- Check the header, the footer and the phone menu on each kind of page.
- Every header and footer link opens a page, not a 404.

### Support chat

`apps/storefront/src/modules/chat`, `app/api/chat`, `apps/agent`, `packages/agent-core`

- Run the checks in [Support chat](compose-stack.md#support-chat) and [Waiting, retry and error states](compose-stack.md#waiting-retry-and-error-states).
- An error shows the reference, which is the turn's correlation ID. The same ID appears in `docker compose logs storefront`.
- The keyboard reaches the chat button and the message box.
- When the replies come from the model:
  - Each reply is in the shopper's language. Write once in Polish and once in English ([design.md](../design.md)).
  - The agent never claims an action no tool took, such as a refund or a cancellation ([ADR 0008](../adr/0008-one-agent-loop-with-write-policy-in-code.md)).
  - It shows no order details before the shopper is verified ([Identity](../design.md#identity-authentication-and-authorization)).

### Crawlers and page metadata

`apps/storefront/src/middleware.ts`, `app/robots.ts`, a page's `metadata`

- Run the checks in [Crawlers](compose-stack.md#crawlers).
- Each page's title in the browser tab names that page.

### Admin and backend

`apps/backend/src/admin`, `api`, `workflows`, `modules`, `subscribers`

- Open the Admin pages the change touches, then one order and one product in Admin.

### Migrations and seed

Any `migrations` folder, `apps/backend/src/seed`, `apps/backend/src/scripts`

- [Reset to a fresh store](compose-stack.md#reset-to-a-fresh-store), then seed twice. The second run changes nothing.
- The counts from steps 2 and 3 of the walk still hold.
- In Admin, the synthetic orders cover every state the support agent handles: unfulfilled, fulfilled, shipped, delivered, canceled and exchanged.

### Compose and images

`compose.yaml`, `infra/`, any `Dockerfile`

- Start from empty volumes ([Reset to a fresh store](compose-stack.md#reset-to-a-fresh-store)). Every service turns healthy.
- Then do the baseline walk.

## When something is wrong

- Don't merge, and don't tick the box.
- Comment on the issue with the URL, what you expected, what you saw and a screenshot. Add the correlation ID if one was shown (`X-Correlation-ID`).
- For a factory pull request, close it and run the factory again for that issue. The factory reads your comments as part of the spec and continues from the branch's commits.

When a step here stops matching the shop, the pull request that changed the shop updates this runbook.
