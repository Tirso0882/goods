import { createHash, randomUUID } from 'crypto'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { medusaIntegrationTestRunner } from '@medusajs/test-utils'
import { CUSTOMERS, ORDERS } from '../../src/seed/customers-and-orders'
import { loadContract } from '../helpers/commerce-port'
import { runMigrationScripts, seed } from '../helpers/seed'

jest.setTimeout(300_000)

const AGENT_SECRET = 'test-agent-secret-0123456789abcdef'
const AUTH = { authorization: `Bearer ${AGENT_SECRET}` }

type Proof = { email: string; order_number: string; postcode: string }

medusaIntegrationTestRunner({
  env: { AGENT_SUPPORT_SECRET: AGENT_SECRET },
  testSuite: ({ api, getContainer }) => {
    let contract: Awaited<ReturnType<typeof loadContract>>
    /** The true proof for each seeded order, by seed key. */
    const proofs = new Map<string, Proof>()
    const proofFor = (key: string) => proofs.get(key)!
    const numberOf = (key: string) => proofFor(key).order_number

    /** A fresh read grant for the order with this seed key. */
    const grantFor = async (key: string) => {
      const response = await api.post(
        '/support/verifications',
        { case_id: randomUUID(), proof: { method: 'guest_order', ...proofFor(key) } },
        { headers: AUTH }
      )
      return response.data.grant as string
    }

    const getOrder = async (orderNumber: string, headers: Record<string, string>) => {
      const response = await api.get(`/support/orders/${encodeURIComponent(orderNumber)}`, {
        headers,
        validateStatus: () => true,
      })
      contract.expectResponse('get', '/orders/{order_number}', response)
      return response
    }
    const getWithGrant = (orderNumber: string, grant: string) =>
      getOrder(orderNumber, { ...AUTH, 'x-verification-grant': grant })

    beforeAll(async () => {
      contract = await loadContract()
      const container = getContainer()
      await runMigrationScripts(container)
      await seed(container)

      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data: orders } = await query.graph({
        entity: 'order',
        fields: ['display_id', 'metadata'],
      })
      for (const fixture of ORDERS) {
        const order = orders.find((o) => o.metadata?.seed_key === fixture.key)!
        const customer = CUSTOMERS.find((c) => c.email === fixture.email)!
        proofs.set(fixture.key, {
          email: fixture.email,
          order_number: String(order.display_id),
          postcode: customer.postal_code,
        })
      }
    })

    describe('GET /support/orders/{order_number}', () => {
      it('returns the order its grant covers, with items, shipping method and tracking', async () => {
        const before = Date.now()
        const response = await getWithGrant(numberOf('SO-04'), await grantFor('SO-04'))

        expect(response.status).toBe(200)
        expect(response.data).toEqual({
          order_number: numberOf('SO-04'),
          placed_at: expect.any(String),
          status: 'shipped',
          after_sale: 'none',
          items: [
            {
              title: 'Pear Moissanite Y-Necklace',
              variant: 'Silver / 45 cm',
              sku: 'NEC-PYN-SLV-45',
              quantity: 1,
            },
          ],
          shipping_method: 'Standard Shipping',
          tracking: [{ number: 'TEST-SO04-1', url: 'https://tracking.example.com/TEST-SO04-1' }],
        })
        expect(new Date(response.data.placed_at).getTime()).toBeLessThanOrEqual(before)
      })

      // The table in issue #152: each seeded state, as the port's two status fields.
      it.each([
        ['SO-01', 'unfulfilled', 'processing', 'none'],
        ['SO-03', 'fulfilled (packed)', 'processing', 'none'],
        ['SO-04', 'shipped', 'shipped', 'none'],
        ['SO-05', 'delivered', 'delivered', 'none'],
        ['SO-06', 'canceled', 'canceled', 'none'],
        ['SO-07', 'return-requested', 'delivered', 'return_in_progress'],
        ['SO-08', 'return-approved', 'delivered', 'returned'],
        ['SO-09', 'return-deducted', 'delivered', 'returned'],
        ['SO-10', 'exchanged', 'delivered', 'exchanged'],
        ['SO-11', 'claim-replaced', 'delivered', 'replacement_sent'],
        ['SO-12', 'claim-refunded', 'delivered', 'partly_refunded'],
      ])(
        'returns a %s order (%s) as %s with after_sale %s',
        async (key, _state, status, afterSale) => {
          const response = await getWithGrant(numberOf(key), await grantFor(key))

          expect(response.status).toBe(200)
          expect(response.data).toMatchObject({ status, after_sale: afterSale })
        }
      )

      it('lists the items as ordered, not the ones an exchange or a claim sent', async () => {
        for (const key of ['SO-02', 'SO-10', 'SO-11', 'SO-12']) {
          const fixture = ORDERS.find((o) => o.key === key)!
          const response = await getWithGrant(numberOf(key), await grantFor(key))

          const items = response.data.items.map((i: { sku: string; quantity: number }) => ({
            sku: i.sku,
            quantity: i.quantity,
          }))
          expect(items).toEqual(expect.arrayContaining(fixture.items))
          expect(items).toHaveLength(fixture.items.length)
          expect(response.data.shipping_method).toBe(fixture.shipping)
        }
      })

      it('carries no email, address or payment data, anywhere in the body', async () => {
        for (const fixture of ORDERS) {
          const customer = CUSTOMERS.find((c) => c.email === fixture.email)!
          const response = await getWithGrant(numberOf(fixture.key), await grantFor(fixture.key))
          const body = JSON.stringify(response.data).toLowerCase()

          expect(response.status).toBe(200)
          for (const personal of [
            customer.email,
            customer.first_name,
            customer.last_name,
            customer.phone,
            customer.address_1,
            customer.postal_code,
            customer.city,
          ]) {
            expect(body).not.toContain(personal.toLowerCase())
          }
          // Every key at every depth; values like `partly_refunded` are the contract's own words.
          const keys: string[] = []
          JSON.stringify(response.data, (key, value) => (keys.push(key.toLowerCase()), value))
          expect(
            keys.filter((k) => /email|address|payment|postal|phone|card|price|amount|total/.test(k))
          ).toEqual([])
        }
      })

      it('answers an unknown order and an order the grant does not cover the same way', async () => {
        const grant = await grantFor('SO-04')
        const responses = [
          await getWithGrant('999999', grant),
          await getWithGrant(`0${numberOf('SO-04')}`, grant),
          await getWithGrant(numberOf('SO-05'), grant),
          await getWithGrant('x'.repeat(64), grant),
        ]

        for (const response of responses) {
          expect(response.status).toBe(404)
          expect(response.data).toEqual(responses[0].data)
        }
        expect(responses[0].data.code).toBe('order_not_found')
      })

      it("never returns another order with a grant, the same customer's or someone else's", async () => {
        // SO-01 and SO-11 are both Anna's; SO-02 is Piotr's.
        expect(proofFor('SO-01').email).toBe(proofFor('SO-11').email)
        const grant = await grantFor('SO-01')

        for (const other of ['SO-11', 'SO-02']) {
          const response = await getWithGrant(numberOf(other), grant)
          expect(response.status).toBe(404)
          expect(JSON.stringify(response.data)).not.toContain(numberOf(other))
        }
        expect((await getWithGrant(numberOf('SO-01'), grant)).status).toBe(200)
      })

      it('returns no order for a missing, malformed, unknown or expired grant', async () => {
        const orderNumber = numberOf('SO-05')
        const expired = await grantFor('SO-05')
        const pg = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION)
        await pg('verification_grant')
          .where({ token_hash: createHash('sha256').update(expired).digest('hex') })
          .update({ expires_at: new Date(Date.now() - 1000) })

        const responses = [
          await getOrder(orderNumber, AUTH),
          await getWithGrant(orderNumber, ''),
          await getWithGrant(orderNumber, 'not-a-grant'),
          await getWithGrant(orderNumber, 'A'.repeat(43)),
          await getWithGrant(orderNumber, expired),
        ]

        for (const response of responses) {
          expect(response.status).toBe(403)
          expect(response.data).toEqual(responses[0].data)
        }
        expect(responses[0].data.code).toBe('grant_invalid')
      })

      it('refuses a request without the agent secret, or with a wrong one, even with a grant', async () => {
        const grant = await grantFor('SO-04')

        for (const authorization of [undefined, 'Bearer not-the-agent-secret-at-all-000000']) {
          const headers: Record<string, string> = { 'x-verification-grant': grant }
          if (authorization) headers.authorization = authorization
          const response = await getOrder(numberOf('SO-04'), headers)

          expect(response.status).toBe(401)
          expect(response.data.code).toBe('unauthorized')
        }
      })

      it('changes nothing in the order', async () => {
        const snapshot = async () => {
          const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
          const { data } = await query.graph({
            entity: 'order',
            fields: ['*', 'items.*', 'fulfillments.*', 'summary.*'],
            filters: { display_id: numberOf('SO-04') },
          })
          return data
        }
        const grant = await grantFor('SO-04')
        const before = await snapshot()

        await getWithGrant(numberOf('SO-04'), grant)

        expect(await snapshot()).toEqual(before)
      })

      it('has no tracking until the order ships', async () => {
        for (const key of ['SO-01', 'SO-03', 'SO-06']) {
          const response = await getWithGrant(numberOf(key), await grantFor(key))
          expect(response.data.tracking).toEqual([])
        }
      })
    })
  },
})
