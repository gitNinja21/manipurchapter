import { NextResponse } from "next/server";
import { publicReviewRoute, submitReview } from "@/lib/customerReviewServer";
import { jsonBody } from "@/lib/team";
export const POST = publicReviewRoute(async req => NextResponse.json(await submitReview(req,await jsonBody(req))));
