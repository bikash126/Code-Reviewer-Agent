import { ReviewResult } from "../types";
import { REVIEW_RESULT_JSON_SCHEMA } from "./reviewSchema";
import { parseReviewJson } from "./resultParser";

const RESPONSES_URL = "https://api.openai.com/v1/responses";

export class OpenAiReviewError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "OpenAiReviewError";
  }
}

export type FetchLike = typeof fetch;

interface ResponsesApiOutputTextItem {
  type: "output_text";
  text: string;
}
interface ResponsesApiMessageItem {
  type: "message";
  content: ResponsesApiOutputTextItem[];
}
interface ResponsesApiBody {
  output_text?: string;
  output?: (ResponsesApiMessageItem | { type: string })[];
}

export class OpenAiClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchLike = fetch,
  ) {}

  async runReview(prompt: string, model: string): Promise<Omit<ReviewResult, "generatedAt" | "model">> {
    const response = await this.fetchFn(RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
        text: {
          format: {
            type: "json_schema",
            name: "pr_review_result",
            schema: REVIEW_RESULT_JSON_SCHEMA,
            strict: true,
          },
        },
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new OpenAiReviewError(`OpenAI request failed (${response.status}): ${bodyText.slice(0, 500)}`, response.status);
    }

    const body = (await response.json()) as ResponsesApiBody;
    const text = extractOutputText(body);
    if (!text) {
      throw new OpenAiReviewError("OpenAI response did not contain any output text.");
    }

    return parseReviewJson(text);
  }
}

export function extractOutputText(body: ResponsesApiBody): string | undefined {
  if (body.output_text) {
    return body.output_text;
  }
  for (const item of body.output ?? []) {
    if (item.type === "message") {
      const message = item as ResponsesApiMessageItem;
      const textItem = message.content.find((c) => c.type === "output_text");
      if (textItem) {
        return textItem.text;
      }
    }
  }
  return undefined;
}
