import { Module } from '@nestjs/common';

/**
 * Organizational boundary for provider SPIs.
 *
 * Concrete adapters are bound by the feature/integration module that owns their
 * lifecycle. No production adapter is registered here.
 */
@Module({})
export class ProvidersModule {}
