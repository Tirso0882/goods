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

  // The product copy rules of #133, applied to the fixture: the agent retrieves
  // and repeats this copy, so it may only claim what the product fields back.
  // The fixture has no lab report, hallmark, certificate or gold fineness field.
  describe('claims', () => {
    const unbacked: [string, RegExp][] = [
      [
        'skin and metal-content claims need a lab report',
        /hypoallergenic|nickel[- ]free|lead[- ]free|cadmium[- ]free|sensitive (ears|skin)/i,
      ],
      ['a hallmark needs a hallmark field', /hallmark/i],
      ['a certificate needs one on file', /certif/i],
      [
        'environmental claims are banned (Directive 2024/825)',
        /\beco\b|sustainab|recycled|ethical|conflict[- ]free|green/i,
      ],
      ['freshwater pearls are cultured, not natural', /\bnatural\b/i],
      [
        'gold fineness needs a fineness field',
        /\b(9|10|14|18|22|24)\s?k(t|arat)?\b|\b(375|585|750|916|999)\b/i,
      ],
      ['gold is only ever plating, so it says so', /\bgold\b(?!-plated)/i],
    ]
    const copy = CATALOG.map(
      (p) =>
        [
          p.handle,
          p,
          [p.title, p.description, ...p.options.flatMap((o) => o.values)].join('\n'),
        ] as const
    )

    it.each(copy)('%s: makes no claim its fields do not back', (_, product, text) => {
      for (const [rule, pattern] of unbacked) {
        expect({ rule, match: text.match(pattern)?.[0] ?? null }).toEqual({ rule, match: null })
      }
      if (/925|sterling/i.test(text)) expect(product.material).toMatch(/925 sterling silver/)
    })
  })
})
