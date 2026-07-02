import { PotentialIssue, RiskLevel } from "../types";

export class OpenAiResultParseError extends Error {
  constructor(message: string, readonly raw?: unknown) {
    super(message);
    this.name = "OpenAiResultParseError";
  }
}

export interface ParsedReview {
  summaryMarkdown: string;
  riskLevel: RiskLevel;
  keyChanges: string[];
  potentialIssues: PotentialIssue[];
  testSuggestions: string[];
}

const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high"];
const SEVERITIES: PotentialIssue["severity"][] = ["info", "warning", "critical"];

/** Parses + validates the JSON payload returned by the OpenAI structured-output review call. */
export function parseReviewJson(text: string): ParsedReview {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new OpenAiResultParseError(`OpenAI review response was not valid JSON: ${(err as Error).message}`, text);
  }

  if (typeof data !== "object" || data === null) {
    throw new OpenAiResultParseError("OpenAI review response was not a JSON object.", data);
  }
  const obj = data as Record<string, unknown>;

  const summaryMarkdown = obj.summaryMarkdown;
  if (typeof summaryMarkdown !== "string" || summaryMarkdown.trim().length === 0) {
    throw new OpenAiResultParseError("OpenAI review response is missing 'summaryMarkdown'.", data);
  }

  const riskLevel = obj.riskLevel;
  if (typeof riskLevel !== "string" || !RISK_LEVELS.includes(riskLevel as RiskLevel)) {
    throw new OpenAiResultParseError(`OpenAI review response has an invalid 'riskLevel': ${String(riskLevel)}`, data);
  }

  const keyChanges = toStringArray(obj.keyChanges, "keyChanges");
  const testSuggestions = toStringArray(obj.testSuggestions, "testSuggestions");
  const potentialIssues = toPotentialIssues(obj.potentialIssues);

  return {
    summaryMarkdown,
    riskLevel: riskLevel as RiskLevel,
    keyChanges,
    testSuggestions,
    potentialIssues,
  };
}

function toStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value)) {
    throw new OpenAiResultParseError(`OpenAI review response field '${fieldName}' was not an array.`, value);
  }
  return value.map((item, i) => {
    if (typeof item !== "string") {
      throw new OpenAiResultParseError(`OpenAI review response field '${fieldName}[${i}]' was not a string.`, item);
    }
    return item;
  });
}

function toPotentialIssues(value: unknown): PotentialIssue[] {
  if (!Array.isArray(value)) {
    throw new OpenAiResultParseError("OpenAI review response field 'potentialIssues' was not an array.", value);
  }
  return value.map((item, i) => {
    if (typeof item !== "object" || item === null) {
      throw new OpenAiResultParseError(`OpenAI review response field 'potentialIssues[${i}]' was not an object.`, item);
    }
    const entry = item as Record<string, unknown>;
    const severity = entry.severity;
    if (typeof severity !== "string" || !SEVERITIES.includes(severity as PotentialIssue["severity"])) {
      throw new OpenAiResultParseError(`OpenAI review response field 'potentialIssues[${i}].severity' is invalid.`, entry);
    }
    const detail = entry.detail;
    if (typeof detail !== "string") {
      throw new OpenAiResultParseError(`OpenAI review response field 'potentialIssues[${i}].detail' was not a string.`, entry);
    }
    const file = typeof entry.file === "string" && entry.file.length > 0 ? entry.file : undefined;
    return { severity: severity as PotentialIssue["severity"], detail, file };
  });
}
