import path from 'path'
import SwaggerParser from '@apidevtools/swagger-parser'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'

/** The commerce port's contract, the source of truth for the agent and the store (ADR 0019). */
export const CONTRACT_PATH = path.join(
  __dirname,
  '../../../../contracts/commerce-port.openapi.yaml'
)

type Operation = {
  responses: Record<string, { content?: { 'application/json'?: { schema: object } } }>
}
type Document = { paths: Record<string, Record<string, Operation>> }

/**
 * Checks HTTP responses against the contract. Each response must be one the
 * operation declares, and its body must match that response's schema.
 */
export async function loadContract() {
  const doc = (await SwaggerParser.dereference(CONTRACT_PATH)) as unknown as Document
  const ajv = new Ajv2020({ strict: false, allErrors: true })
  addFormats(ajv)

  return {
    expectResponse(
      method: 'get' | 'post',
      route: string,
      response: { status: number; data: unknown }
    ) {
      const declared = doc.paths[route]?.[method]?.responses[String(response.status)]
      if (!declared) {
        throw new Error(`${method.toUpperCase()} ${route} declares no ${response.status} response`)
      }
      const schema = declared.content?.['application/json']?.schema
      if (!schema) return
      const validate = ajv.compile(schema)
      if (!validate(response.data)) {
        throw new Error(
          `${method.toUpperCase()} ${route} ${response.status} doesn't match the contract: ` +
            ajv.errorsText(validate.errors) +
            `\n${JSON.stringify(response.data)}`
        )
      }
    },
  }
}
