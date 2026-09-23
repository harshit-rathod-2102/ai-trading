import { Exchange } from '../../../common/enums/exchange.enum';
import { InstrumentType } from '../../../common/enums/instrument-type.enum';
import { JsonObject } from '../../../common/types/json-value';

export interface ProviderInstrument {
  readonly symbol: string;
  readonly exchange: Exchange;
  readonly name: string;
  readonly instrumentType: InstrumentType;
  readonly sector: string | null;
  readonly industry: string | null;
  readonly providerInstrumentId: string;
  readonly providerSymbol: string | null;
  readonly isIndex: boolean;
  readonly metadata?: JsonObject;
}

export interface ProviderInstrumentReference {
  readonly symbol: string;
  readonly exchange: Exchange;
  readonly instrumentType: InstrumentType;
  /**
   * Present once provider discovery has been mapped to the local instrument.
   * Symbol-based development adapters may operate without it.
   */
  readonly providerInstrumentId?: string;
}
