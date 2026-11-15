import { MedusaService } from '@medusajs/framework/utils'
import VerificationAttempt from './models/verification-attempt'
import VerificationGrant from './models/verification-grant'

class SupportVerificationModuleService extends MedusaService({
  VerificationAttempt,
  VerificationGrant,
}) {}

export default SupportVerificationModuleService
