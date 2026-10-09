import type { MedusaContainer, SearchTypes } from '@medusajs/framework/types'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { createProductsWorkflow } from '@medusajs/medusa/core-flows'
import { medusaIntegrationTestRunner } from '@medusajs/test-utils'
import { resolveProductIds } from '../../src/search/helpers/resolve-product-ids'

jest.setTimeout(120_000)

const resolve = (container: MedusaContainer, name: string, data: unknown) =>
  resolveProductIds({ name, data }, {
    container: { query: container.resolve(ContainerRegistrationKeys.QUERY) },
  } as unknown as SearchTypes.SearchIngestionContext)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    describe('resolveProductIds', () => {
      let productId: string
      let optionId: string
      let valueId: string

      beforeAll(async () => {
        const container = getContainer()
        const {
          result: [product],
        } = await createProductsWorkflow(container).run({
          input: {
            products: [
              {
                title: 'Test Ring',
                options: [{ title: 'Ring size', values: ['50', '52'] }],
                variants: [
                  { title: '50', options: { 'Ring size': '50' }, prices: [] },
                  { title: '52', options: { 'Ring size': '52' }, prices: [] },
                ],
              },
            ],
          },
        })
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const {
          data: [option],
        } = await query.graph({
          entity: 'product_option',
          fields: ['id', 'values.id'],
          filters: { title: 'Ring size' },
        })
        productId = product.id
        optionId = option.id
        valueId = option.values![0]!.id
      })

      it('maps a product option event to its products', async () => {
        await expect(
          resolve(getContainer(), 'product-option.updated', { id: optionId })
        ).resolves.toEqual([productId])
      })

      it('maps a product option value event to its products', async () => {
        await expect(
          resolve(getContainer(), 'product-option-value.updated', [{ id: valueId }])
        ).resolves.toEqual([productId])
      })
    })
  },
})
