import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Instrument } from './entities/instrument.entity';
import { Universe } from './entities/universe.entity';
import { UniverseMembership } from './entities/universe-membership.entity';
import { InstrumentsController } from './instruments.controller';
import { UniversesController } from './universes.controller';
import { InstrumentsService } from './instruments.service';

@Module({
  imports: [TypeOrmModule.forFeature([Instrument, Universe, UniverseMembership])],
  controllers: [InstrumentsController, UniversesController],
  providers: [InstrumentsService],
  exports: [InstrumentsService],
})
export class InstrumentsModule {}
