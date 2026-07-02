import { BitbucketClient } from "../bitbucket/client";
import { OpenAiClient } from "../openai/client";
import { buildReviewPrompt } from "../openai/promptBuilder";
import { PullRequestDetail, ReviewResult } from "../types";

export class ReviewService {
  constructor(
    private readonly bitbucketClient: BitbucketClient,
    private readonly openAiClient: OpenAiClient,
    private readonly model: string,
    private readonly maxDiffBytes: number,
  ) {}

  async reviewPullRequest(detail: PullRequestDetail): Promise<ReviewResult> {
    const { diff, truncated } = await this.bitbucketClient.getDiff(detail.id, this.maxDiffBytes);
    const prompt = buildReviewPrompt(detail, diff, truncated);
    const parsed = await this.openAiClient.runReview(prompt, this.model);
    return {
      ...parsed,
      generatedAt: new Date().toISOString(),
      model: this.model,
    };
  }
}
