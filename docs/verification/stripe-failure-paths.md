# Stripe failure paths and duplicate webhooks

Checked on 2026-10-10 against the local stack: Medusa 2.21.2 with `@medusajs/medusa/payment-stripe` (`capture: true`), Stripe test mode (`goods sandbox`), and `stripe listen` forwarding to `/hooks/payment/stripe_stripe`. Every case uses a fresh Poland cart with one Moon and Feather Necklace (80.00 PLN), built through the Store API. The PaymentIntent is confirmed through the Stripe API with Stripe's test payment methods, the same call the Payment Element makes in the browser.

## Results

| Case | Result |
| --- | --- |
| Declined card | Pass |
| 3D Secure | Pass |
| Invalid webhook signature | Pass |
| Duplicate webhook delivery | Pass |
| Delayed webhook delivery | Pass |
| Refund shows in Admin | Pass |

### Declined card

Confirmed with `pm_card_chargeDeclined`. Stripe returned `card_declined` (`generic_decline`) and left the PaymentIntent in `requires_payment_method`. `POST /store/carts/:id/complete` failed. Medusa started an order inside the completion workflow and rolled it back: the order row is gone and its `order_cart` link is soft-deleted. The cart stays open, the payment collection is `not_paid`, the session is `error`, and no payment row exists. A second completion attempt returns `Payment sessions are required to complete cart`, so the shopper must pick a payment method again, which the storefront's payment step does.

### 3D Secure

Confirmed with `pm_card_threeDSecure2Required`. Stripe returned `requires_action` with a `redirect_to_url`. Completing the cart at that point was refused (`not_allowed`) and the session stayed `requires_more`. After clicking Complete on Stripe's test challenge page, the PaymentIntent became `succeeded`. The `payment_intent.succeeded` webhook alone completed the cart and created a captured order for 80 PLN, without the storefront calling complete.

### Invalid webhook signature

Posted a `payment_intent.succeeded` body for a real, unpaid cart's PaymentIntent, once signed with the wrong secret and once with no `stripe-signature` header. Both requests got HTTP 200: Medusa's webhook route acknowledges every request and processes it later in the `payment.webhook_received` subscriber. There, the provider's `constructWebhookEvent` calls Stripe's `webhooks.constructEvent`, which throws, so the subscriber fails and nothing is processed. The cart stayed open, the collection stayed `not_paid`, and the session stayed `pending`.

A 200 on the hook route does not mean the event was accepted. Check order and payment state instead.

### Duplicate webhook delivery

After a successful payment (1 order, 1 payment, 1 capture, collection `completed` at 80), the same `payment_intent.succeeded` event was delivered three more times: twice re-signed with the real secret and posted directly, and once through `stripe events resend`. State afterwards was unchanged: 1 order, 1 payment, 1 capture, collection `completed` at 80.

### Delayed webhook delivery

With `stripe listen` stopped, a PaymentIntent was confirmed with `pm_card_visa` and Stripe reported `succeeded`. Twenty seconds later Medusa still had no order and the collection was `not_paid`, which is correct: Medusa only learns about the payment from the webhook or the storefront. After restarting `stripe listen` and running `stripe events resend`, the event arrived (200), and Medusa created the order with 1 payment, 1 capture and the collection `completed` at 80.

In the real checkout the storefront also calls complete when the shopper comes back, so a late webhook only matters if the shopper closes the tab first. `stripe listen` does not queue events it missed while stopped, so locally redeliver them with `stripe events resend <event id>`.

### Refund

Refunded 80 PLN on the delayed-case order with `POST /admin/payments/:id/refund`. Admin reports the order `payment_status` as `refunded` with `refunded_amount` 80, and Stripe shows refund `re_...` for 8000 grosze, `succeeded`.

## Rerunning

Test payment methods: `pm_card_visa`, `pm_card_chargeDeclined`, `pm_card_threeDSecure2Required`. In the browser, use the matching cards `4242 4242 4242 4242`, `4000 0000 0000 0002` and `4000 0027 6000 3184` ([Stripe testing docs](https://docs.stripe.com/testing)).

Restarting `stripe listen` on the same machine keeps the same signing secret, so `STRIPE_WEBHOOK_SECRET` does not need updating.
