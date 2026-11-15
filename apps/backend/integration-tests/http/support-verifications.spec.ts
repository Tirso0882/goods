import { createHash, randomUUID } from 'crypto'
import SwaggerParser from '@apidevtools/swagger-parser'
import { ContainerRegistrationKeys } from '@medusajs/framework/utils'
import { medusaIntegrationTestRunner } from '@medusajs/test-utils'
import { SUPPORT_VERIFICATION_MODULE } from '../../src/modules/support-verification'
import type SupportVerificationModuleService from '../../src/modules/support-verification/service'
import { CUSTOMERS, ORDERS } from '../../src/seed/customers-and-orders'
import { CONTRACT_PATH, loadContract } from '../helpers/commerce-port'
import { runMigrationScripts, seed } from '../helpers/seed'

jest.setTimeout(300_000)

const AGENT_SECRET = 'test-agent-secret-0123456789abcdef'

type Proof = { email: string; order_number: string; postcode: string }

medusaIntegrationTestRunner({
  env: { AGENT_SUPPORT_SECRET: AGENT_SECRET },
  testSuite: ({ api, getContainer }) => {
    let contract: Awaited<ReturnType<typeof loadContract>>
    /** The true proof for each seeded order, by seed key. */
    const proofs = new Map<string, Proof>()

    const verify = async (
      body: unknown,
      headers: Record<string, string> = { authorization: `Bearer ${AGENT_SECRET}` }
    ) => {
      const response = await api.post('/support/verifications', body, {
        headers,
        validateStatus: () => true,
      })
      contract.expectResponse('post', '/verifications', response)
      return response
    }
    const proofFor = (key: string) => proofs.get(key)!
    const verifications = () =>
      getContainer().resolve<SupportVerificationModuleService>(SUPPORT_VERIFICATION_MODULE)
    /** The order as the rest of the store sees it, to show the route changed nothing. */
    const orderSnapshot = async (orderNumber: string) => {
      const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const { data } = await query.graph({
        entity: 'order',
        fields: ['*', 'items.*', 'shipping_address.*', 'summary.*'],
        filters: { display_id: orderNumber },
      })
      return data
    }
    const attempt = (proof: Proof, caseId = randomUUID()) =>
      verify({ case_id: caseId, proof: { method: 'guest_order', ...proof } })

    beforeAll(async () => {
      contract = await loadContract()
      const container = getContainer()
      await runMigrationScripts(container)
      await seed(container)

      const query = container.resolve(ContainerRegistrationKeys.QUERY)
      const { data: orders } = await query.graph({
        entity: 'order',
        fields: ['display_id', 'email', 'metadata'],
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

    describe('commerce port contract', () => {
      it('is a valid OpenAPI document', async () => {
        await expect(SwaggerParser.validate(CONTRACT_PATH)).resolves.toBeTruthy()
      })
    })

    describe('POST /support/verifications', () => {
      it('returns a read grant for that one order, bound to the case, for 30 minutes', async () => {
        const caseId = randomUUID()
        const proof = proofFor('SO-04')
        const before = Date.now()

        const response = await attempt(proof, caseId)

        expect(response.status).toBe(201)
        expect(response.data).toMatchObject({
          case_id: caseId,
          tier: 'read',
          scope: { type: 'order', order_number: proof.order_number },
        })
        const expiresAt = new Date(response.data.expires_at).getTime()
        expect(expiresAt).toBeGreaterThanOrEqual(before + 30 * 60_000 - 1000)
        expect(expiresAt).toBeLessThanOrEqual(Date.now() + 30 * 60_000 + 1000)
      })

      it('matches the email in any letter case and the postcode with or without spaces and dashes', async () => {
        const proof = proofFor('SO-05')
        const digits = proof.postcode.replace(/[\s-]/g, '')
        const shouted = proof.email.toUpperCase()

        for (const postcode of [digits, ` ${digits.slice(0, 2)} - ${digits.slice(2)} `]) {
          const response = await attempt({ ...proof, email: shouted, postcode })
          expect(response.status).toBe(201)
        }
      })

      it('keeps only the hash of the grant', async () => {
        const caseId = randomUUID()
        const response = await attempt(proofFor('SO-03'), caseId)
        const token: string = response.data.grant

        const grants = await verifications().listVerificationGrants({ case_id: caseId })
        expect(grants).toHaveLength(1)
        expect(grants[0].token_hash).toBe(createHash('sha256').update(token).digest('hex'))
        expect(JSON.stringify(grants)).not.toContain(token)
      })

      it('answers a wrong email, a wrong postcode and an unknown order number the same way', async () => {
        const proof = proofFor('SO-06')
        const wrong = [
          { ...proof, email: 'someone.else@example.com' },
          { ...proof, postcode: '99-999' },
          { ...proof, order_number: '999999' },
          { ...proof, order_number: `0${proof.order_number}` },
        ]

        const responses: Awaited<ReturnType<typeof attempt>>[] = []
        for (const proof of wrong) responses.push(await attempt(proof))

        for (const response of responses) {
          expect(response.status).toBe(403)
          expect(response.data).toEqual(responses[0].data)
        }
        expect(responses[0].data.code).toBe('verification_failed')
      })

      it('locks a support case after 5 failed attempts, even for a correct proof', async () => {
        const caseId = randomUUID()
        const proof = proofFor('SO-07')
        // Different emails, so only the case counter reaches the limit.
        for (let i = 0; i < 5; i++) {
          const failed = await attempt({ ...proof, email: `guess-${i}@example.com` }, caseId)
          expect(failed.status).toBe(403)
        }

        const locked = await attempt(proof, caseId)

        expect(locked.status).toBe(429)
        expect(locked.data.code).toBe('verification_locked')
        expect((await attempt(proof)).status).toBe(201)
      })

      it('locks an email after 5 failed attempts in 24 hours, from any case', async () => {
        const proof = proofFor('SO-08')
        for (let i = 0; i < 5; i++) {
          const failed = await attempt({ ...proof, postcode: `99-99${i}` })
          expect(failed.status).toBe(403)
        }

        const locked = await attempt(proof)

        expect(locked.status).toBe(429)
        expect(locked.data.code).toBe('verification_locked')
        expect((await attempt(proofFor('SO-04'))).status).toBe(201)
      })

      it('counts an email failure for 24 hours only', async () => {
        const proof = proofFor('SO-09')
        for (let i = 0; i < 5; i++) await attempt({ ...proof, postcode: `99-99${i}` })
        expect((await attempt(proof)).status).toBe(429)

        // Age the failures past the window; the case counter isn't involved, each attempt had its own case.
        const failures = await verifications().listVerificationAttempts({ outcome: 'failed' })
        const pg = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION)
        await pg('verification_attempt')
          .whereIn(
            'id',
            failures.map((f) => f.id)
          )
          .update({ created_at: new Date(Date.now() - 24 * 60 * 60_000 - 60_000) })

        expect((await attempt(proof)).status).toBe(201)
      })

      it('records every attempt with its outcome', async () => {
        const caseId = randomUUID()
        const proof = proofFor('SO-10')
        await attempt(proof, caseId)
        for (let i = 0; i < 5; i++) await attempt({ ...proof, postcode: `99-99${i}` }, caseId)
        await attempt(proof, caseId)

        const attempts = await verifications().listVerificationAttempts(
          { case_id: caseId },
          { order: { created_at: 'ASC' } }
        )
        expect(attempts.map((a) => a.outcome)).toEqual([
          'granted',
          'failed',
          'failed',
          'failed',
          'failed',
          'failed',
          'locked',
        ])
        expect(attempts.every((a) => a.order_number === proof.order_number)).toBe(true)
      })

      it('refuses a request without the agent secret, or with a wrong one', async () => {
        const body = {
          case_id: randomUUID(),
          proof: { method: 'guest_order', ...proofFor('SO-04') },
        }

        const refused: Record<string, string>[] = [
          {},
          { authorization: 'Bearer not-the-agent-secret-at-all-000000' },
        ]
        for (const headers of refused) {
          const response = await verify(body, headers)
          expect(response.status).toBe(401)
          expect(response.data.code).toBe('unauthorized')
        }
        expect(await verifications().listVerificationAttempts({})).toHaveLength(0)
      })

      it('refuses a body that does not match the contract', async () => {
        const response = await verify({ case_id: 'not-a-uuid', proof: { method: 'guest_order' } })

        expect(response.status).toBe(400)
        expect(response.data.code).toBe('invalid_request')
      })

      it('changes nothing in the order', async () => {
        const proof = proofFor('SO-02')
        const before = await orderSnapshot(proof.order_number)

        expect((await attempt(proof)).status).toBe(201)
        await attempt({ ...proof, postcode: '99-999' })

        expect(await orderSnapshot(proof.order_number)).toEqual(before)
      })
    })
  },
})
