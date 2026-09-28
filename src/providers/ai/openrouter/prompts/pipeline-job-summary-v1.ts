import { PipelineJobSummaryInput } from '../../models/pipeline-job-summary';

export const PIPELINE_JOB_SUMMARY_PROMPT_VERSION = 'pipeline-job-summary-v1';
// Some routed models consume part of this budget for reasoning before emitting
// the small schema-bounded response. Keep the response itself capped at 600
// characters in the JSON schema while allowing enough completion headroom.
export const PIPELINE_JOB_SUMMARY_MAX_OUTPUT_TOKENS = 1200;

export const PIPELINE_JOB_SUMMARY_SYSTEM_PROMPT = `You summarize a completed Indian equity swing-trading scan.
Use only the supplied facts. Write at most two short sentences suitable for WhatsApp.
State the market regime and the scan funnel outcome. Do not invent causes, recommendations,
trades, returns, or facts. Return only the requested JSON object.`;

export function pipelineJobSummaryUserPrompt(
  input: PipelineJobSummaryInput,
  includeJsonInstruction: boolean,
): string {
  const instruction = includeJsonInstruction
    ? '\nReturn valid JSON with exactly one string field named "summary".'
    : '';
  return `Summarize this completed scan:\n${JSON.stringify(input)}${instruction}`;
}
