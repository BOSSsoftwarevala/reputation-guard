import { streamText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import {
  createLovableAiGatewayProvider,
  describeGatewayError,
  requireLovableApiKey,
  SCAN_MODEL,
  RESPONSE_MODEL,
} from "./ai-gateway.server";

export const AnalysisSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      violation_category: z.enum([
        "spam",
        "fake_content",
        "off_topic",
        "conflict_of_interest",
        "harassment",
        "abuse",
        "threats",
        "extortion",
        "personal_information",
        "promotional",
        "other",
        "none",
      ]),
      confidence: z.number(),
      priority: z.enum(["high", "medium", "review_required", "normal"]),
      explanation: z.string(),
      evidence: z.array(z.string()),
      recommended_action: z.string(),
      is_legitimate_negative: z.boolean(),
    }),
  ),
});

export type AnalysisResult = z.infer<typeof AnalysisSchema>["results"][number];

const SYSTEM_PROMPT = `You are a compliance analyst for a Google review reputation platform.

You assess whether a Google review MAY violate Google's publicly documented review policies
(spam, fake/manipulated content, off-topic, conflict of interest, harassment, abuse, threats,
extortion, personal information, promotional content, other restricted content).

Hard rules:
- A negative or 1-star review is NOT a violation by itself. Genuine bad experiences are legitimate.
- Never fabricate evidence. Every evidence string must be a short verbatim quote from the review text,
  or an objective observation about the review metadata (e.g. "no service details, 3 words long").
- If there is no clear policy signal, return violation_category "none", priority "normal",
  is_legitimate_negative true when the rating is 1-3, and recommend a public response instead of removal.
- Use priority "review_required" when a human must verify context you cannot see.
- confidence is 0-100 and must reflect genuine uncertainty. Never output 100.
- recommended_action is one short sentence, and must only suggest legitimate Google reporting/appeal
  steps or a public response. Never suggest reporting a legitimate review.

Priority mapping:
- high: strong, self-evident policy violation in the text.
- medium: plausible violation needing supporting context.
- review_required: ambiguous, needs human verification.
- normal: no clear violation.

Return one result object per input review, keyed by the given id. Keep explanation under 45 words.`;

export type ReviewForScan = {
  id: string;
  rating: number;
  reviewer_name: string;
  review_text: string;
  review_date: string;
  location_name?: string | null;
};

export async function analyzeReviews(
  reviews: ReviewForScan[],
  businessName: string,
): Promise<{ results: AnalysisResult[] } | { error: string; retryable: boolean }> {
  if (reviews.length === 0) return { results: [] };
  const provider = createLovableAiGatewayProvider(requireLovableApiKey());

  const prompt = [
    `Business under review: ${businessName}`,
    `Analyze the following ${reviews.length} Google reviews.`,
    "",
    ...reviews.map((r) =>
      [
        `--- review id: ${r.id}`,
        `rating: ${r.rating}/5`,
        `reviewer: ${r.reviewer_name}`,
        `date: ${r.review_date}`,
        r.location_name ? `location: ${r.location_name}` : null,
        `text: ${r.review_text || "(no text)"}`,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n");

  try {
    const result = streamText({
      model: provider(SCAN_MODEL),
      system: SYSTEM_PROMPT,
      prompt,
      output: Output.object({ schema: AnalysisSchema }),
    });
    const output = await result.output;
    return { results: output.results };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      return { error: "The AI returned an unreadable analysis for this batch.", retryable: true };
    }
    const described = describeGatewayError(error);
    console.error("[scan] gateway failure", described.message);
    return { error: described.message, retryable: described.retryable };
  }
}

const ResponseSchema = z.object({
  response: z.string(),
  rationale: z.string(),
});

export async function draftReviewResponse(input: {
  businessName: string;
  reviewerName: string;
  rating: number;
  reviewText: string;
  tone: string;
}): Promise<{ response: string; rationale: string } | { error: string; retryable: boolean }> {
  const provider = createLovableAiGatewayProvider(requireLovableApiKey());
  try {
    const result = streamText({
      model: provider(RESPONSE_MODEL),
      system: `You write public owner responses to Google reviews for "${input.businessName}".
Rules: never dispute facts you cannot verify, never invent details about the customer's visit,
never promise compensation, never ask the reviewer to delete the review. Stay under 90 words,
acknowledge the experience, and offer a concrete offline next step. Tone: ${input.tone}.`,
      prompt: `Reviewer: ${input.reviewerName}\nRating: ${input.rating}/5\nReview: ${input.reviewText}`,
      output: Output.object({ schema: ResponseSchema }),
    });
    const output = await result.output;
    return output;
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error)) {
      return { error: "The AI could not draft a response. Try again.", retryable: true };
    }
    const described = describeGatewayError(error);
    return { error: described.message, retryable: described.retryable };
  }
}
