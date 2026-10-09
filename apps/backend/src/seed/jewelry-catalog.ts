/**
 * The synthetic jewelry catalog. Plain data, no Medusa imports, so the seed
 * and the count check read the same source.
 *
 * Structure, attributes and price levels follow Bamoer (docs/adr/0002). Names
 * and descriptions are our own. Images are hotlinked from Bamoer's CDN: they
 * are copyrighted, so they are for local development only and must be
 * replaced before anything is deployed.
 */
export const CATEGORIES = ['Bracelets', 'Earrings', 'Necklaces', 'Rings'] as const
export type Category = (typeof CATEGORIES)[number]

export type FixtureVariant = {
  sku: string
  options: Record<string, string>
  /** Gross PLN, 23% VAT included. Stored as-is, not in grosze. */
  price_pln: number
  stock: number
}

export type FixtureProduct = {
  handle: string
  title: string
  category: Category
  description: string
  weight_g: number
  material: string
  /** The first one is the thumbnail. */
  images: string[]
  options: { title: string; values: string[] }[]
  variants: FixtureVariant[]
}

const bamoerImages = (...files: string[]) =>
  files.map((file) => `https://cdn.shopify.com/s/files/1/1013/3304/1466/files/${file}`)

/** EU ring sizes: inner circumference in mm. */
const RING_SIZES = ['50', '52', '54', '56', '58']

type MetalPrice = { metal: string; code: string; price_pln: number }

/** Every metal in every ring size. Edge sizes sell less, so they get less stock. */
function ringVariants(skuPrefix: string, metals: MetalPrice[]): FixtureVariant[] {
  return metals.flatMap(({ metal, code, price_pln }) =>
    RING_SIZES.map((size) => ({
      sku: `${skuPrefix}-${code}-${size}`,
      options: { Metal: metal, 'Ring size': size },
      price_pln,
      stock: size === '50' || size === '58' ? 8 : 20,
    }))
  )
}

export const CATALOG: FixtureProduct[] = [
  // ---- Rings ---------------------------------------------------------------
  {
    handle: 'classic-solitaire-moissanite-ring',
    title: 'Classic Solitaire Moissanite Ring',
    category: 'Rings',
    description:
      'A single 1 ct round brilliant moissanite in a four-prong setting on a slim 925 sterling silver band. Nickel-free and hypoallergenic, made for everyday wear. Comes with a GRA certificate for the stone.',
    weight_g: 2.1,
    material: '925 sterling silver',
    images: bamoerImages('MSR101.jpg', 'MSR101_4.jpg', 'MSR101_5.jpg'),
    options: [
      { title: 'Metal', values: ['Silver', '18K Gold Plated'] },
      { title: 'Ring size', values: RING_SIZES },
    ],
    variants: ringVariants('RNG-SOL', [
      { metal: 'Silver', code: 'SLV', price_pln: 189 },
      { metal: '18K Gold Plated', code: 'GLD', price_pln: 219 },
    ]),
  },
  {
    handle: 'moissanite-half-eternity-band',
    title: 'Moissanite Half-Eternity Band',
    category: 'Rings',
    description:
      'Eleven small moissanites set across the top half of a 2 mm band, so the stones face up and the inside stays smooth against the finger. Wears well alone or stacked with a solitaire.',
    weight_g: 1.8,
    material: '925 sterling silver',
    images: bamoerImages('MSR123.jpg', 'MSR123_4.jpg', 'MSR123_5.jpg'),
    options: [
      { title: 'Metal', values: ['Silver', 'Rose Gold Plated'] },
      { title: 'Ring size', values: RING_SIZES },
    ],
    variants: ringVariants('RNG-HET', [
      { metal: 'Silver', code: 'SLV', price_pln: 109 },
      { metal: 'Rose Gold Plated', code: 'RSG', price_pln: 129 },
    ]),
  },
  {
    handle: 'halo-cushion-moissanite-ring',
    title: 'Halo Cushion Moissanite Ring',
    category: 'Rings',
    description:
      'A cushion-cut moissanite framed by a halo of cubic zirconia on a split shank. The halo makes the centre stone look larger. Rhodium finish on silver to slow tarnish.',
    weight_g: 2.9,
    material: '925 sterling silver',
    images: bamoerImages('MSR110.jpg', 'MSR110_4.jpg', 'MSR110_6.jpg'),
    options: [
      { title: 'Metal', values: ['Silver', '18K Gold Plated'] },
      { title: 'Ring size', values: RING_SIZES },
    ],
    variants: ringVariants('RNG-HAL', [
      { metal: 'Silver', code: 'SLV', price_pln: 159 },
      { metal: '18K Gold Plated', code: 'GLD', price_pln: 185 },
    ]),
  },
  {
    handle: 'pear-moissanite-open-ring',
    title: 'Pear Moissanite Open Ring',
    category: 'Rings',
    description:
      'An open-ended band with a 1.5 ct pear moissanite on one end and a small round stone on the other. The open shape adjusts by about two sizes, which makes it an easy gift when you do not know the ring size. Do not bend it open and shut repeatedly.',
    weight_g: 2.4,
    material: '925 sterling silver',
    images: bamoerImages('MSR125-E.jpg', 'MSR125-E_4.jpg', 'MSR125-E_5.jpg'),
    options: [{ title: 'Metal', values: ['Silver', '18K Gold Plated'] }],
    variants: [
      { sku: 'RNG-PEO-SLV', options: { Metal: 'Silver' }, price_pln: 119, stock: 30 },
      { sku: 'RNG-PEO-GLD', options: { Metal: '18K Gold Plated' }, price_pln: 139, stock: 18 },
    ],
  },
  {
    handle: 'v-shape-pearl-ring',
    title: 'V-Shape Pearl Ring',
    category: 'Rings',
    description:
      'A chevron band holding a 6 mm freshwater pearl at the point. Each pearl is natural, so shape and lustre vary slightly. Put the ring on after perfume and lotion, and wipe the pearl with a soft dry cloth.',
    weight_g: 1.9,
    material: '925 sterling silver, freshwater pearl',
    images: bamoerImages(
      'BSR780_2_WH_a38f49ca-db2b-4aa6-8b7d-cfbb3f54e47a.jpg',
      'BSR780_4_2509c955-9f25-46d0-ab73-2644c57b8554.jpg',
      'BSR780_5_f3404276-a5dc-40f3-ac38-8648d1a2cdd6.jpg'
    ),
    options: [{ title: 'Ring size', values: ['50', '52', '54', '56'] }],
    variants: [
      { sku: 'RNG-VPR-50', options: { 'Ring size': '50' }, price_pln: 95, stock: 6 },
      { sku: 'RNG-VPR-52', options: { 'Ring size': '52' }, price_pln: 95, stock: 14 },
      { sku: 'RNG-VPR-54', options: { 'Ring size': '54' }, price_pln: 95, stock: 14 },
      { sku: 'RNG-VPR-56', options: { 'Ring size': '56' }, price_pln: 95, stock: 6 },
    ],
  },

  // ---- Earrings ------------------------------------------------------------
  {
    handle: 'classic-four-prong-studs',
    title: 'Classic Four-Prong Studs',
    category: 'Earrings',
    description:
      'Round 5 mm stones in a four-prong basket setting with screw-back posts. Choose cubic zirconia for everyday sparkle or moissanite for a harder stone with more fire. Posts are 925 silver, safe for sensitive ears.',
    weight_g: 1.2,
    material: '925 sterling silver',
    images: bamoerImages('SCE1646-S.jpg', 'SCE1646-LB.jpg', 'SCE1646-LBK.jpg'),
    options: [
      { title: 'Stone', values: ['Cubic Zirconia', 'Moissanite'] },
      { title: 'Metal', values: ['Silver', '18K Gold Plated'] },
    ],
    variants: [
      { sku: 'EAR-4PS-CZ-SLV', options: { Stone: 'Cubic Zirconia', Metal: 'Silver' }, price_pln: 89, stock: 40 },
      { sku: 'EAR-4PS-CZ-GLD', options: { Stone: 'Cubic Zirconia', Metal: '18K Gold Plated' }, price_pln: 109, stock: 25 },
      { sku: 'EAR-4PS-MOI-SLV', options: { Stone: 'Moissanite', Metal: 'Silver' }, price_pln: 149, stock: 20 },
      { sku: 'EAR-4PS-MOI-GLD', options: { Stone: 'Moissanite', Metal: '18K Gold Plated' }, price_pln: 169, stock: 12 },
    ],
  },
  {
    handle: 'moissanite-huggie-hoops',
    title: 'Moissanite Huggie Hoops',
    category: 'Earrings',
    description:
      'Small 12 mm hoops that sit close to the lobe, with a row of moissanites on the front face and a hinged click closure. Comfortable to sleep in and easy to pair with a second piercing.',
    weight_g: 2.6,
    material: '925 sterling silver',
    images: bamoerImages('MSE156.jpg', 'MSE156_4.jpg', 'MSE156_5.jpg'),
    options: [{ title: 'Metal', values: ['Silver', '18K Gold Plated', 'Rose Gold Plated'] }],
    variants: [
      { sku: 'EAR-HUG-SLV', options: { Metal: 'Silver' }, price_pln: 109, stock: 30 },
      { sku: 'EAR-HUG-GLD', options: { Metal: '18K Gold Plated' }, price_pln: 129, stock: 20 },
      { sku: 'EAR-HUG-RSG', options: { Metal: 'Rose Gold Plated' }, price_pln: 129, stock: 10 },
    ],
  },
  {
    handle: 'pear-moissanite-drop-hoops',
    title: 'Pear Moissanite Drop Hoops',
    category: 'Earrings',
    description:
      'Slim hoops with a removable 1 ct pear moissanite charm. Wear them with the drop for evenings and without it for the day. The charm slides off the hoop, so there is no extra clasp to lose.',
    weight_g: 3.1,
    material: '925 sterling silver',
    images: bamoerImages('MSE157.jpg', 'MSE157_4.jpg', 'MSE157_5.jpg'),
    options: [{ title: 'Metal', values: ['Silver', '18K Gold Plated'] }],
    variants: [
      { sku: 'EAR-PDH-SLV', options: { Metal: 'Silver' }, price_pln: 129, stock: 22 },
      { sku: 'EAR-PDH-GLD', options: { Metal: '18K Gold Plated' }, price_pln: 149, stock: 14 },
    ],
  },
  {
    handle: 'butterfly-drop-earrings',
    title: 'Butterfly Drop Earrings',
    category: 'Earrings',
    description:
      'Light openwork butterflies hanging from French hooks, with a tiny cubic zirconia on each wing. At under a gram each they are light enough for all-day wear.',
    weight_g: 1.6,
    material: '925 sterling silver',
    images: bamoerImages('YIE427.jpg', 'YIE427_4.jpg', 'YIE427_5.jpg'),
    options: [{ title: 'Metal', values: ['Silver'] }],
    variants: [{ sku: 'EAR-BUT-SLV', options: { Metal: 'Silver' }, price_pln: 55, stock: 45 }],
  },

  // ---- Necklaces -----------------------------------------------------------
  {
    handle: 'pear-moissanite-y-necklace',
    title: 'Pear Moissanite Y-Necklace',
    category: 'Necklaces',
    description:
      'A fine cable chain that meets at a round moissanite, with a 1 ct pear moissanite hanging below it in a Y shape. The chain has an extra ring at 40 cm on the 45 cm length, so you can wear it shorter.',
    weight_g: 2.7,
    material: '925 sterling silver',
    images: bamoerImages('MSN082.jpg', 'MSN082_4.jpg', 'MSN082_5.jpg'),
    options: [
      { title: 'Metal', values: ['Silver', '18K Gold Plated'] },
      { title: 'Chain length', values: ['40 cm', '45 cm'] },
    ],
    variants: [
      { sku: 'NEC-PYN-SLV-40', options: { Metal: 'Silver', 'Chain length': '40 cm' }, price_pln: 149, stock: 15 },
      { sku: 'NEC-PYN-SLV-45', options: { Metal: 'Silver', 'Chain length': '45 cm' }, price_pln: 149, stock: 20 },
      { sku: 'NEC-PYN-GLD-40', options: { Metal: '18K Gold Plated', 'Chain length': '40 cm' }, price_pln: 175, stock: 8 },
      { sku: 'NEC-PYN-GLD-45', options: { Metal: '18K Gold Plated', 'Chain length': '45 cm' }, price_pln: 175, stock: 12 },
    ],
  },
  {
    handle: 'bezel-station-necklace',
    title: 'Bezel Station Necklace',
    category: 'Necklaces',
    description:
      'Five cubic zirconias in smooth bezel settings spaced along a thin chain. Bezels hold the stones flush, so nothing catches on knitwear. Longer lengths sit lower on the collarbone.',
    weight_g: 3.4,
    material: '925 sterling silver',
    images: bamoerImages('MSN051-A.jpg', 'MSN051-B.jpg', 'MSN051-A_5.jpg'),
    options: [{ title: 'Chain length', values: ['40 cm', '45 cm', '50 cm'] }],
    variants: [
      { sku: 'NEC-BEZ-40', options: { 'Chain length': '40 cm' }, price_pln: 159, stock: 12 },
      { sku: 'NEC-BEZ-45', options: { 'Chain length': '45 cm' }, price_pln: 165, stock: 18 },
      { sku: 'NEC-BEZ-50', options: { 'Chain length': '50 cm' }, price_pln: 172, stock: 7 },
    ],
  },
  {
    handle: 'moon-and-feather-necklace',
    title: 'Moon and Feather Necklace',
    category: 'Necklaces',
    description:
      'A crescent moon with a small feather charm on a box chain. Oxidised details give the feather texture. Store it in the pouch it ships in to keep the oxidised finish from rubbing off.',
    weight_g: 2.2,
    material: '925 sterling silver',
    images: bamoerImages('YIN147.jpg', 'YIN147_6.jpg', 'YIN147_4.jpg'),
    options: [{ title: 'Chain length', values: ['40 cm', '45 cm'] }],
    variants: [
      { sku: 'NEC-MNF-40', options: { 'Chain length': '40 cm' }, price_pln: 65, stock: 35 },
      { sku: 'NEC-MNF-45', options: { 'Chain length': '45 cm' }, price_pln: 65, stock: 35 },
    ],
  },
  {
    handle: 'four-leaf-clover-lariat',
    title: 'Four-Leaf Clover Lariat',
    category: 'Necklaces',
    description:
      'A lariat with a sliding clover bead, so you set the length yourself from choker to 50 cm. The clover has mother-of-pearl inlay on one side and plain polished silver on the other. Hallmarked in Poland.',
    weight_g: 5.6,
    material: '925 sterling silver, mother-of-pearl',
    images: bamoerImages('MSN074.jpg', 'MSN074_4.jpg', 'MSN074_5.jpg'),
    options: [{ title: 'Metal', values: ['Silver', '18K Gold Plated'] }],
    variants: [
      { sku: 'NEC-CLV-SLV', options: { Metal: 'Silver' }, price_pln: 199, stock: 10 },
      { sku: 'NEC-CLV-GLD', options: { Metal: '18K Gold Plated' }, price_pln: 229, stock: 6 },
    ],
  },

  // ---- Bracelets -----------------------------------------------------------
  {
    handle: 'moissanite-tennis-bracelet-3mm',
    title: 'Moissanite Tennis Bracelet 3 mm',
    category: 'Bracelets',
    description:
      'A continuous line of 3 mm moissanites, each in its own four-prong link, with a box clasp and a safety catch. Measure your wrist and add 1 to 1.5 cm to choose the length. Hallmarked in Poland.',
    weight_g: 9.5,
    material: '925 sterling silver',
    images: bamoerImages('MSB050.jpg', 'MSB050_5.jpg', 'MSB050_6.jpg'),
    options: [{ title: 'Bracelet length', values: ['16 cm', '17 cm', '18 cm'] }],
    variants: [
      { sku: 'BRC-TEN-16', options: { 'Bracelet length': '16 cm' }, price_pln: 399, stock: 5 },
      { sku: 'BRC-TEN-17', options: { 'Bracelet length': '17 cm' }, price_pln: 409, stock: 8 },
      { sku: 'BRC-TEN-18', options: { 'Bracelet length': '18 cm' }, price_pln: 419, stock: 5 },
    ],
  },
  {
    handle: 'heart-snake-chain-bracelet',
    title: 'Heart Snake Chain Bracelet',
    category: 'Bracelets',
    description:
      'A smooth snake chain with a heart clasp that doubles as the centrepiece. Fits standard European charms. Snake chains kink if folded, so store it straight. Hallmarked in Poland.',
    weight_g: 8.2,
    material: '925 sterling silver',
    images: bamoerImages('BSB213.jpg', 'BSB213_6.jpg', 'BSB213_7.jpg'),
    options: [{ title: 'Bracelet length', values: ['17 cm', '19 cm'] }],
    variants: [
      { sku: 'BRC-HSC-17', options: { 'Bracelet length': '17 cm' }, price_pln: 259, stock: 12 },
      { sku: 'BRC-HSC-19', options: { 'Bracelet length': '19 cm' }, price_pln: 269, stock: 9 },
    ],
  },
  {
    handle: 'starry-chain-bracelet',
    title: 'Starry Chain Bracelet',
    category: 'Bracelets',
    description:
      'A delicate chain with three small stars and an extender, adjustable from 16 to 19 cm. A simple first piece of silver jewelry and a popular gift.',
    weight_g: 1.7,
    material: '925 sterling silver',
    images: bamoerImages('YIB096.jpg', 'YIB096_4.jpg', 'YIB096_5.jpg'),
    options: [{ title: 'Metal', values: ['Silver', '18K Gold Plated'] }],
    variants: [
      { sku: 'BRC-STR-SLV', options: { Metal: 'Silver' }, price_pln: 69, stock: 40 },
      { sku: 'BRC-STR-GLD', options: { Metal: '18K Gold Plated' }, price_pln: 85, stock: 25 },
    ],
  },
]
