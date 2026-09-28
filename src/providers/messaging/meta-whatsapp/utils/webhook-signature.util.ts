import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyMetaWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !/^sha256=[a-f0-9]{64}$/i.test(signatureHeader)) return false;
  const supplied = Buffer.from(signatureHeader.slice(7), 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function constantTimeTokenEquals(supplied: string, expected: string): boolean {
  const suppliedDigest = createHmac('sha256', expected).update(supplied).digest();
  const expectedDigest = createHmac('sha256', expected).update(expected).digest();
  return timingSafeEqual(suppliedDigest, expectedDigest);
}
