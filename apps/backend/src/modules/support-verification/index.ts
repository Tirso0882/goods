import { Module } from '@medusajs/framework/utils'
import SupportVerificationModuleService from './service'

export const SUPPORT_VERIFICATION_MODULE = 'supportVerification'

export default Module(SUPPORT_VERIFICATION_MODULE, {
  service: SupportVerificationModuleService,
})
