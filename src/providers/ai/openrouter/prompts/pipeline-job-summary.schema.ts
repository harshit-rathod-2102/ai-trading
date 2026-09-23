export const PIPELINE_JOB_SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string', minLength: 1, maxLength: 600 },
  },
  required: ['summary'],
} as const;
