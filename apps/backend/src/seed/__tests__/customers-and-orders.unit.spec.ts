import { CATALOG } from '../jewelry-catalog'
import { CUSTOMERS, ORDER_STATES, ORDERS, RETURN_REASONS } from '../customers-and-orders'

const variants = new Map(CATALOG.flatMap((p) => p.variants.map((v) => [v.sku, v] as const)))

describe('customers and orders fixture', () => {
  it('has at least 10 customers with unique example.com emails', () => {
    expect(CUSTOMERS.length).toBeGreaterThanOrEqual(10)
    const emails = CUSTOMERS.map((c) => c.email)
    expect(new Set(emails).size).toBe(emails.length)
    for (const email of emails) {
      expect(email).toMatch(/^[a-z.]+@example\.com$/)
    }
  })

  it('uses only made-up addresses and unassigned phone numbers', () => {
    for (const c of CUSTOMERS) {
      expect(c.address_1).toMatch(/^ul\. Przykładowa \d+$/)
      expect(c.city).toBe('Przykładowo')
      expect(c.phone).toMatch(/^\+48 000 000 \d{3}$/)
    }
  })

  it('covers every order state, and every customer has an order', () => {
    expect([...new Set(ORDERS.map((o) => o.state))].sort()).toEqual([...ORDER_STATES].sort())
    expect(new Set(ORDERS.map((o) => o.email))).toEqual(new Set(CUSTOMERS.map((c) => c.email)))
  })

  it('has unique keys and orders only catalog SKUs', () => {
    const keys = ORDERS.map((o) => o.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const item of ORDERS.flatMap((o) => o.items)) {
      expect(variants.has(item.sku)).toBe(true)
      expect(item.quantity).toBeGreaterThan(0)
    }
  })

  it('gives returns a known reason and claims an item from the order', () => {
    const reasons = RETURN_REASONS.map((r) => r.value as string)
    for (const order of ORDERS) {
      if ('reason' in order) {
        expect(reasons).toContain(order.reason)
      }
      if ('claim_sku' in order) {
        expect(order.items.map((i) => i.sku)).toContain(order.claim_sku)
      }
    }
  })

  it('exchanges one item for another catalog variant of the same product at the same price', () => {
    for (const order of ORDERS) {
      if (order.state !== 'exchanged') continue
      expect(order.items).toHaveLength(1)
      const [item] = order.items
      expect(order.new_sku).not.toBe(item.sku)
      const product = CATALOG.find((p) => p.variants.some((v) => v.sku === item.sku))!
      expect(product.variants.map((v) => v.sku)).toContain(order.new_sku)
      expect(variants.get(order.new_sku)!.price_pln).toBe(variants.get(item.sku)!.price_pln)
    }
  })

  it('deducts less than the value of the returned goods', () => {
    for (const order of ORDERS) {
      if (order.state !== 'return-deducted') continue
      const goods = order.items.reduce((s, i) => s + variants.get(i.sku)!.price_pln * i.quantity, 0)
      expect(order.deduction_pln).toBeGreaterThan(0)
      expect(order.deduction_pln).toBeLessThan(goods)
    }
  })
})
