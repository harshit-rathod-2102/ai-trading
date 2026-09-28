export const RISK_V1_CONFIG = {
  version: 'risk-v1',
  priceScale: 4,
  ratioScale: 4,
  target1R: '2',
  target2R: '3',
  minimumStopAtrMultiple: '0.5',
  maximumStopAtrMultiple: '5',
  maximumEntryExtensionAtr: '3',
  momentumEntryBufferPercent: '0',
  maximumQuantity: 2_147_483_647,
  allowMissingSector: true,
} as const;
