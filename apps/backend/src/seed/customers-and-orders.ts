/**
 * Synthetic customers and their orders, one or more per order state the
 * support agent must handle. Plain data, no Medusa imports, so the seed and
 * the checks read the same source.
 *
 * Emails use the reserved example.com domain, phone numbers are all zeros
 * after the country code, and streets and towns are made up.
 *
 * Every date is the real time the seed ran. A return is only eligible for a
 * refund once the item has been received and inspected.
 */

export const ORDER_STATES = [
  'unfulfilled',
  'fulfilled',
  'shipped',
  'delivered',
  'canceled',
  /** Customer asked to return it; the parcel hasn't arrived for inspection. */
  'return-requested',
  /** Received, inspection passed, full refund including the original delivery. */
  'return-approved',
  /** Received, inspection found wear, refund reduced by the diminished value. */
  'return-deducted',
  /** Wrong size: the item came back and the right size went out. */
  'exchanged',
  /** Faulty on arrival: replacement sent, no return needed. */
  'claim-replaced',
  /** Item missing from the parcel: refunded for that item. */
  'claim-refunded',
] as const
export type OrderState = (typeof ORDER_STATES)[number]

export const RETURN_REASONS = [
  {
    value: 'changed_mind',
    label: 'Changed my mind',
    description: 'Withdrawal within 14 days of delivery. No reason needed (Art. 27).',
  },
  {
    value: 'wrong_size',
    label: 'Wrong size',
    description: 'The customer needs a different ring, chain or bracelet size.',
  },
] as const
export type ReturnReason = (typeof RETURN_REASONS)[number]['value']

export type FixtureCustomer = {
  email: string
  first_name: string
  last_name: string
  phone: string
  address_1: string
  postal_code: string
  city: string
}

export type FixtureOrder = {
  /** Stored in the order's metadata as `seed_key`, so re-runs find it. */
  key: string
  email: string
  shipping: 'Standard Shipping' | 'Express Courier'
  items: { sku: string; quantity: number }[]
} & (
  | { state: 'unfulfilled' | 'fulfilled' | 'shipped' | 'delivered' | 'canceled' }
  /** Returns take back every item in the order. */
  | { state: 'return-requested' | 'return-approved'; reason: ReturnReason; note: string }
  | { state: 'return-deducted'; reason: ReturnReason; note: string; deduction_pln: number }
  /** Exchanges take back the order's only item and send `new_sku`. */
  | { state: 'exchanged'; reason: ReturnReason; note: string; new_sku: string }
  | {
      state: 'claim-replaced' | 'claim-refunded'
      claim_reason: 'missing_item' | 'wrong_item' | 'production_failure' | 'other'
      claim_sku: string
      note: string
    }
)

const customer = (
  n: number,
  first_name: string,
  last_name: string,
  email: string
): FixtureCustomer => ({
  email: `${email}@example.com`,
  first_name,
  last_name,
  phone: `+48 000 000 ${String(n).padStart(3, '0')}`,
  address_1: `ul. Przykładowa ${n}`,
  postal_code: `00-${String(n).padStart(3, '0')}`,
  city: 'Przykładowo',
})

export const CUSTOMERS: FixtureCustomer[] = [
  customer(1, 'Anna', 'Nowak', 'anna.nowak'),
  customer(2, 'Piotr', 'Wiśniewski', 'piotr.wisniewski'),
  customer(3, 'Katarzyna', 'Wójcik', 'katarzyna.wojcik'),
  customer(4, 'Tomasz', 'Kamiński', 'tomasz.kaminski'),
  customer(5, 'Magdalena', 'Lewandowska', 'magdalena.lewandowska'),
  customer(6, 'Michał', 'Zieliński', 'michal.zielinski'),
  customer(7, 'Agnieszka', 'Szymańska', 'agnieszka.szymanska'),
  customer(8, 'Jakub', 'Woźniak', 'jakub.wozniak'),
  customer(9, 'Ewa', 'Dąbrowska', 'ewa.dabrowska'),
  customer(10, 'Łukasz', 'Kozłowski', 'lukasz.kozlowski'),
]

const email = (local: string) => `${local}@example.com`

export const ORDERS: FixtureOrder[] = [
  {
    key: 'SO-01',
    email: email('anna.nowak'),
    state: 'unfulfilled',
    shipping: 'Standard Shipping',
    items: [{ sku: 'RNG-SOL-SLV-54', quantity: 1 }],
  },
  {
    key: 'SO-02',
    email: email('piotr.wisniewski'),
    state: 'unfulfilled',
    shipping: 'Express Courier',
    items: [
      { sku: 'EAR-HUG-GLD', quantity: 1 },
      { sku: 'NEC-MNF-45', quantity: 1 },
    ],
  },
  {
    key: 'SO-03',
    email: email('katarzyna.wojcik'),
    state: 'fulfilled',
    shipping: 'Standard Shipping',
    items: [{ sku: 'BRC-TEN-17', quantity: 1 }],
  },
  {
    key: 'SO-04',
    email: email('tomasz.kaminski'),
    state: 'shipped',
    shipping: 'Standard Shipping',
    items: [{ sku: 'NEC-PYN-SLV-45', quantity: 1 }],
  },
  {
    key: 'SO-05',
    email: email('magdalena.lewandowska'),
    state: 'delivered',
    shipping: 'Express Courier',
    items: [{ sku: 'EAR-4PS-MOI-SLV', quantity: 1 }],
  },
  {
    key: 'SO-06',
    email: email('jakub.wozniak'),
    state: 'canceled',
    shipping: 'Standard Shipping',
    items: [{ sku: 'NEC-CLV-GLD', quantity: 1 }],
  },
  {
    key: 'SO-07',
    email: email('michal.zielinski'),
    state: 'return-requested',
    reason: 'changed_mind',
    note: 'Customer withdrew within 14 days. Waiting for the parcel to inspect it.',
    shipping: 'Standard Shipping',
    items: [{ sku: 'RNG-HET-SLV-56', quantity: 1 }],
  },
  {
    key: 'SO-08',
    email: email('agnieszka.szymanska'),
    state: 'return-approved',
    reason: 'changed_mind',
    note: 'Inspection passed: unworn, box and tags intact. Refunded the goods and the original delivery (Art. 32).',
    shipping: 'Standard Shipping',
    items: [{ sku: 'BRC-STR-GLD', quantity: 2 }],
  },
  {
    key: 'SO-09',
    email: email('ewa.dabrowska'),
    state: 'return-deducted',
    reason: 'changed_mind',
    note: 'Inspection found scratches from wear. Refund reduced by the diminished value (Art. 34 ust. 4).',
    deduction_pln: 40,
    shipping: 'Express Courier',
    items: [{ sku: 'EAR-PDH-GLD', quantity: 1 }],
  },
  {
    key: 'SO-10',
    email: email('lukasz.kozlowski'),
    state: 'exchanged',
    reason: 'wrong_size',
    note: 'Ring too small. Size 52 came back unworn, size 54 sent.',
    new_sku: 'RNG-VPR-54',
    shipping: 'Standard Shipping',
    items: [{ sku: 'RNG-VPR-52', quantity: 1 }],
  },
  {
    key: 'SO-11',
    email: email('anna.nowak'),
    state: 'claim-replaced',
    claim_reason: 'production_failure',
    claim_sku: 'EAR-BUT-SLV',
    note: 'Earring hook arrived broken. Replacement sent, no return needed.',
    shipping: 'Standard Shipping',
    items: [{ sku: 'EAR-BUT-SLV', quantity: 1 }],
  },
  {
    key: 'SO-12',
    email: email('piotr.wisniewski'),
    state: 'claim-refunded',
    claim_reason: 'missing_item',
    claim_sku: 'NEC-BEZ-45',
    note: 'Necklace missing from the parcel. Refunded the necklace.',
    shipping: 'Express Courier',
    items: [
      { sku: 'BRC-HSC-17', quantity: 1 },
      { sku: 'NEC-BEZ-45', quantity: 1 },
    ],
  },
]
