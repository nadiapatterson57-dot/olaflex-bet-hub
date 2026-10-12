import { asc, eq } from "drizzle-orm";
import {
  CreatePredictionBody,
  GetPredictionResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  predictionMatchesTable,
  predictionResultEventsTable,
  predictionsTable,
} from "@workspace/db/schema";

export type PredictionInput = typeof CreatePredictionBody._output;

export type PredictionRow = typeof predictionsTable.$inferSelect;
export type MatchRow = typeof predictionMatchesTable.$inferSelect;

export async function getMatches(predictionId: string): Promise<MatchRow[]> {
  return db
    .select()
    .from(predictionMatchesTable)
    .where(eq(predictionMatchesTable.predictionId, predictionId))
    .orderBy(asc(predictionMatchesTable.sortOrder));
}

export function shapePrediction(
  row: PredictionRow,
  matches: MatchRow[],
  locked = false,
) {
  const fullMatches = matches.map((match) => ({
    id: match.id,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeLogoUrl: match.homeLogoUrl,
    awayLogoUrl: match.awayLogoUrl,
    competition: match.competition,
    market: match.market,
    selection: match.selection,
    odds: Number(match.odds),
    kickoffAt: match.kickoffAt,
  }));

  const calculatedOdds = matches.reduce(
    (product, match) => product * Number(match.odds),
    matches.length ? 1 : 0,
  );

  return GetPredictionResponse.parse({
    id: row.id,
    title: row.title,
    slug: row.slug,
    publishedAt: row.publishedAt,
    category: row.category,
    risk: row.risk,
    status: row.status,
    result: row.result,
    matches: locked ? [] : fullMatches,
    combinedOdds: locked
      ? null
      : row.combinedOddsOverride == null
        ? Number(calculatedOdds.toFixed(2))
        : Number(row.combinedOddsOverride),
    combinedOddsOverride: locked || row.combinedOddsOverride == null
      ? null
      : Number(row.combinedOddsOverride),
    bookingCode: locked ? null : row.bookingCode,
    analysis: locked ? null : row.analysis,
    imagePath: locked ? null : row.imagePath,
    isAccumulator: matches.length > 1,
    isLocked: locked,
  });
}

function normalizeDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function sameMatchSnapshot(
  existing: MatchRow[],
  incoming: PredictionInput["matches"],
): boolean {
  return (
    existing.length === incoming.length &&
    existing.every((current, index) => {
      const next = incoming[index];
      return (
        next !== undefined &&
        current.homeTeam === next.homeTeam &&
        current.awayTeam === next.awayTeam &&
        (current.homeLogoUrl ?? null) === (next.homeLogoUrl ?? null) &&
        (current.awayLogoUrl ?? null) === (next.awayLogoUrl ?? null) &&
        current.competition === next.competition &&
        current.market === next.market &&
        current.selection === next.selection &&
        Number(current.odds) === next.odds &&
        normalizeDate(current.kickoffAt) ===
          new Date(next.kickoffAt).toISOString()
      );
    })
  );
}

export async function createPrediction(
  input: PredictionInput,
): Promise<ReturnType<typeof shapePrediction>> {
  const [row] = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(predictionsTable)
      .values({
        title: input.title,
        slug: input.slug,
        category: input.category,
        risk: input.risk,
        status: input.status,
        result: input.result,
        bookingCode: input.bookingCode ?? null,
        analysis: input.analysis ?? null,
        imagePath: input.imagePath ?? null,
        combinedOddsOverride:
          input.combinedOddsOverride == null
            ? null
            : String(input.combinedOddsOverride),
        publishedAt: input.status === "published" ? new Date() : null,
      })
      .returning();

    await tx.insert(predictionMatchesTable).values(
      input.matches.map((match, sortOrder) => ({
        predictionId: created.id,
        sortOrder,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        homeLogoUrl: match.homeLogoUrl ?? null,
        awayLogoUrl: match.awayLogoUrl ?? null,
        competition: match.competition,
        market: match.market,
        selection: match.selection,
        odds: String(match.odds),
        kickoffAt: new Date(match.kickoffAt),
      })),
    );

    if (input.result !== "pending") {
      await tx.insert(predictionResultEventsTable).values({
        predictionId: created.id,
        result: input.result,
      });
    }

    return [created];
  });

  return shapePrediction(row, await getMatches(row.id));
}

export async function updatePrediction(
  id: string,
  input: PredictionInput,
): Promise<
  | { kind: "not-found" }
  | { kind: "settlement-conflict" }
  | { kind: "prediction"; value: ReturnType<typeof shapePrediction> }
> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(predictionsTable)
      .where(eq(predictionsTable.id, id))
      .limit(1);

    if (!existing) return { kind: "not-found" };

    const existingMatches = await tx
      .select()
      .from(predictionMatchesTable)
      .where(eq(predictionMatchesTable.predictionId, id))
      .orderBy(asc(predictionMatchesTable.sortOrder));

    const resultChanged = existing.result !== input.result;
    const matchSnapshotUnchanged = sameMatchSnapshot(existingMatches, input.matches);
    const codeUnchanged = (existing.bookingCode ?? null) === (input.bookingCode ?? null);

    if (resultChanged && (!matchSnapshotUnchanged || !codeUnchanged)) {
      return { kind: "settlement-conflict" };
    }

    const publishedAt =
      input.status === "published"
        ? existing.publishedAt ?? new Date()
        : existing.publishedAt;

    const [updated] = await tx
      .update(predictionsTable)
      .set({
        title: input.title,
        slug: input.slug,
        category: input.category,
        risk: input.risk,
        status: input.status,
        result: input.result,
        bookingCode: input.bookingCode ?? null,
        analysis: input.analysis ?? null,
        imagePath: input.imagePath ?? null,
        combinedOddsOverride:
          input.combinedOddsOverride == null
            ? null
            : String(input.combinedOddsOverride),
        publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(predictionsTable.id, id))
      .returning();

    if (!matchSnapshotUnchanged) {
      await tx
        .delete(predictionMatchesTable)
        .where(eq(predictionMatchesTable.predictionId, id));

      await tx.insert(predictionMatchesTable).values(
        input.matches.map((match, sortOrder) => ({
          predictionId: id,
          sortOrder,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeLogoUrl: match.homeLogoUrl ?? null,
          awayLogoUrl: match.awayLogoUrl ?? null,
          competition: match.competition,
          market: match.market,
          selection: match.selection,
          odds: String(match.odds),
          kickoffAt: new Date(match.kickoffAt),
        })),
      );
    }

    if (resultChanged) {
      await tx.insert(predictionResultEventsTable).values({
        predictionId: id,
        result: input.result,
      });
    }

    const matches = await tx
      .select()
      .from(predictionMatchesTable)
      .where(eq(predictionMatchesTable.predictionId, id))
      .orderBy(asc(predictionMatchesTable.sortOrder));

    return {
      kind: "prediction",
      value: shapePrediction(updated, matches),
    };
  });
}
