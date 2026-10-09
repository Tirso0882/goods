import { CATALOG, CATEGORIES } from '../jewelry-catalog'

const variants = CATALOG.flatMap((p) => p.variants)

describe('jewelry catalog fixture', () => {
  it('has at least 10 products across rings, earrings and necklaces', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(10)
    const categories = new Set(CATALOG.map((p) => p.category))
    for (const category of ['Rings', 'Earrings', 'Necklaces']) {
      expect(categories).toContain(category)
    }
  })

  it('uses only known categories, and every category has products', () => {
    expect([...new Set(CATALOG.map((p) => p.category))].sort()).toEqual([...CATEGORIES].sort())
  })

  it('has unique handles and SKUs', () => {
    const handles = CATALOG.map((p) => p.handle)
    const skus = variants.map((v) => v.sku)
    expect(new Set(handles).size).toBe(handles.length)
    expect(new Set(skus).size).toBe(skus.length)
  })

  it.each(CATALOG.map((p) => [p.handle, p] as const))(
    '%s: every variant sets each option to a listed value, once',
    (_, product) => {
      const combos = new Set<string>()
      for (const variant of product.variants) {
        expect(Object.keys(variant.options).sort()).toEqual(
          product.options.map((o) => o.title).sort()
        )
        for (const option of product.options) {
          expect(option.values).toContain(variant.options[option.title])
        }
        combos.add(JSON.stringify(product.options.map((o) => variant.options[o.title])))
      }
      expect(combos.size).toBe(product.variants.length)
    }
  )

  it('gives every variant a positive whole PLN price and stock', () => {
    for (const variant of variants) {
      expect(variant.price_pln).toBeGreaterThan(0)
      expect(Number.isInteger(variant.price_pln)).toBe(true)
      expect(variant.stock).toBeGreaterThan(0)
    }
  })
})
