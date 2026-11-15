import { createHash } from 'crypto'

/** SHA-256 as hex: how grant tokens and emails are kept in this module. */
export const sha256Hex = (value: string) => createHash('sha256').update(value).digest('hex')
