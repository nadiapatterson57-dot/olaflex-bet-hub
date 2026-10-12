import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
} from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreatePredictionBody,
  CreatePredictionResponse,
  DeletePredictionParams,
  GetAdminAccessResponse,
  GetAdminSummaryResponse,
  GetPredictionParams,
  GetPredictionResponse,
  GetResultsQueryParams,
  GetResultsResponse,
  ImportBackupBody,
  ImportBackupResponse,
  ListAdminPredictionsQueryParams,
  ListAdminPredictionsResponse,
  ListPredictionsQueryParams,
  ListPredictionsResponse,
  UpdatePredictionBody,
  UpdatePredictionParams,
  UpdatePredictionResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  blogPostsTable,
  predictionMatchesTable,
  predictionsTable,
  predictionResultEventsTable,
  siteSettingsTable,
} from "@workspace/db/schema";
import { requireAdmin, getAdminIdentity } from "../middlewares/requireAdmin";
import {
  createPrediction,
  getMatches,
  shapePrediction,
  updatePrediction,
} from "../lib/olaflex";

const router: IRouter = Router();

function querySearch(search: string) {
  const pattern = `%${search}%`;
  return or(
    ilike(predictionsTable.title, pattern),
    ilike(predictionsTable.slug, pattern),
    sql`exists (
      select 1 from olaflex_prediction_matches m
      where m.prediction_id = ${predictionsTable.id}
        and (m.home_team ilike ${pattern} or m.away_team ilike ${pattern}
          or m.competition ilike ${pattern})
    )`,
  )!;
}

function dateRange(date?: Date) {
  if (!date) return undefined;
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

async function toPublicRow(row: typeof predictionsTable.$inferSelect) {
  const matches = await getMatches(row.id);
  return shapePrediction(
    row,
    matches,
    row.category === "premium",
  );
}

router.get("/predictions", async (req, res): Promise<void> => {
  const parsed = ListPredictionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { search, date, league, category, result, page, pageSize } = parsed.data;
  const filters = [eq(predictionsTable.status, "published")];
  if (category) filters.push(eq(predictionsTable.category, category));
  if (result) filters.push(eq(predictionsTable.result, result));
  if (search) filters.push(querySearch(search));

  const range = dateRange(date);
  if (range) {
    filters.push(
      sql`exists (
        select 1 from olaflex_prediction_matches m
        where m.prediction_id = ${predictionsTable.id}
          and m.kickoff_at >= ${range.start}
          and m.kickoff_at < ${range.end}
      )`,
    );
  }
  if (league) {
    filters.push(
      sql`exists (
        select 1 from olaflex_prediction_matches m
        where m.prediction_id = ${predictionsTable.id}
          and m.competition ilike ${`%${league}%`}
      )`,
    );
  }

  const where = and(...filters);
  const [countRows, rows] = await Promise.all([
    db.select({ total: count() }).from(predictionsTable).where(where),
    db
      .select()
      .from(predictionsTable)
      .where(where)
      .orderBy(desc(predictionsTable.publishedAt), desc(predictionsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);
  const items = await Promise.all(rows.map(toPublicRow));

  res.json(
    ListPredictionsResponse.parse({
      items,
      page,
      pageSize,
      total: Number(countRows[0]?.total ?? 0),
    }),
  );
});

router.get("/predictions/:slug", async (req, res): Promise<void> => {
  const parsed = GetPredictionParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .select()
    .from(predictionsTable)
    .where(
      and(
        eq(predictionsTable.slug, parsed.data.slug),
        eq(predictionsTable.status, "published"),
      ),
    )
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Prediction not found." });
    return;
  }

  res.json(GetPredictionResponse.parse(await toPublicRow(row)));
});

router.get("/results", async (req, res): Promise<void> => {
  const parsed = GetResultsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { date, result, page, pageSize } = parsed.data;
  const baseFilters = [eq(predictionsTable.status, "published")];
  const range = dateRange(date);
  if (range) {
    baseFilters.push(
      sql`exists (
        select 1 from olaflex_prediction_matches m
        where m.prediction_id = ${predictionsTable.id}
          and m.kickoff_at >= ${range.start}
          and m.kickoff_at < ${range.end}
      )`,
    );
  }
  const allWhere = and(...baseFilters);
  const settledWhere = and(
    ...baseFilters,
    sql`${predictionsTable.result} <> 'pending'`,
  );
  const listWhere = result
    ? and(...baseFilters, eq(predictionsTable.result, result))
    : allWhere;

  const [stats, countRows, rows] = await Promise.all([
    db
      .select({ result: predictionsTable.result, total: count() })
      .from(predictionsTable)
      .where(settledWhere)
      .groupBy(predictionsTable.result),
    db.select({ total: count() }).from(predictionsTable).where(listWhere),
    db
      .select()
      .from(predictionsTable)
      .where(listWhere)
      .orderBy(desc(predictionsTable.publishedAt), desc(predictionsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  const statsByResult = new Map(stats.map((entry) => [entry.result, Number(entry.total)]));
  const won = statsByResult.get("won") ?? 0;
  const lost = statsByResult.get("lost") ?? 0;
  const voided = statsByResult.get("void") ?? 0;
  const predictions = await Promise.all(rows.map(toPublicRow));

  res.json(
    GetResultsResponse.parse({
      statistics: {
        settled: won + lost + voided,
        won,
        lost,
        void: voided,
        winRate: won + lost === 0 ? 0 : Number(((won / (won + lost)) * 100).toFixed(1)),
      },
      predictions,
      page,
      pageSize,
      total: Number(countRows[0]?.total ?? 0),
    }),
  );
});

router.get("/admin/access", async (req, res): Promise<void> => {
  const result = await getAdminIdentity(req);
  if ("status" in result) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(
    GetAdminAccessResponse.parse({
      isAdmin: true,
      email: result.identity.email,
    }),
  );
});

router.get("/admin/summary", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      status: predictionsTable.status,
      result: predictionsTable.result,
      total: count(),
    })
    .from(predictionsTable)
    .groupBy(predictionsTable.status, predictionsTable.result);

  const total = rows.reduce((sum, row) => sum + Number(row.total), 0);
  const published = rows
    .filter((row) => row.status === "published")
    .reduce((sum, row) => sum + Number(row.total), 0);
  const drafts = rows
    .filter((row) => row.status === "draft")
    .reduce((sum, row) => sum + Number(row.total), 0);
  const won = rows
    .filter((row) => row.result === "won" && row.status === "published")
    .reduce((sum, row) => sum + Number(row.total), 0);
  const lost = rows
    .filter((row) => row.result === "lost" && row.status === "published")
    .reduce((sum, row) => sum + Number(row.total), 0);
  const voided = rows
    .filter((row) => row.result === "void" && row.status === "published")
    .reduce((sum, row) => sum + Number(row.total), 0);
  const pending = rows
    .filter((row) => row.result === "pending" && row.status === "published")
    .reduce((sum, row) => sum + Number(row.total), 0);

  res.json(
    GetAdminSummaryResponse.parse({
      total,
      published,
      drafts,
      pending,
      won,
      lost,
      void: voided,
      winRate: won + lost === 0 ? 0 : Number(((won / (won + lost)) * 100).toFixed(1)),
    }),
  );
});

router.get("/admin/predictions", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListAdminPredictionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, status, page, pageSize } = parsed.data;
  const filters = [];
  if (status) filters.push(eq(predictionsTable.status, status));
  if (search) filters.push(querySearch(search));
  const where = filters.length ? and(...filters) : undefined;
  const [countRows, rows] = await Promise.all([
    db.select({ total: count() }).from(predictionsTable).where(where),
    db
      .select()
      .from(predictionsTable)
      .where(where)
      .orderBy(desc(predictionsTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  const items = await Promise.all(
    rows.map(async (row) => shapePrediction(row, await getMatches(row.id))),
  );
  res.json(
    ListAdminPredictionsResponse.parse({
      items,
      page,
      pageSize,
      total: Number(countRows[0]?.total ?? 0),
    }),
  );
});

router.post("/admin/predictions", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreatePredictionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const prediction = await createPrediction(parsed.data);
  res.status(201).json(CreatePredictionResponse.parse(prediction));
});

router.patch(
  "/admin/predictions/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdatePredictionParams.safeParse(req.params);
    const body = UpdatePredictionBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const updated = await updatePrediction(params.data.id, body.data);
    if (updated.kind === "not-found") {
      res.status(404).json({ error: "Prediction not found." });
      return;
    }
    if (updated.kind === "settlement-conflict") {
      res.status(409).json({
        error:
          "Settle the result without changing the booking code, selections, or odds. Edit those separately before settling.",
      });
      return;
    }
    res.json(UpdatePredictionResponse.parse(updated.value));
  },
);

router.delete(
  "/admin/predictions/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeletePredictionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const deleted = await db
      .delete(predictionsTable)
      .where(eq(predictionsTable.id, params.data.id))
      .returning({ id: predictionsTable.id });
    if (!deleted.length) {
      res.status(404).json({ error: "Prediction not found." });
      return;
    }
    res.status(204).end();
  },
);

router.get("/admin/export", requireAdmin, async (_req, res): Promise<void> => {
  const [predictionRows, blogRows, settingsRows] = await Promise.all([
    db.select().from(predictionsTable).orderBy(asc(predictionsTable.createdAt)),
    db.select().from(blogPostsTable).orderBy(asc(blogPostsTable.createdAt)),
    db.select().from(siteSettingsTable).limit(1),
  ]);

  const predictions = await Promise.all(
    predictionRows.map(async (row) => {
      const matches = await getMatches(row.id);
      return {
        title: row.title,
        slug: row.slug,
        category: row.category,
        risk: row.risk,
        status: row.status,
        result: row.result,
        bookingCode: row.bookingCode,
        analysis: row.analysis,
        imagePath: row.imagePath,
        combinedOddsOverride:
          row.combinedOddsOverride == null ? null : Number(row.combinedOddsOverride),
        matches: matches.map((match) => ({
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          homeLogoUrl: match.homeLogoUrl,
          awayLogoUrl: match.awayLogoUrl,
          competition: match.competition,
          market: match.market,
          selection: match.selection,
          odds: Number(match.odds),
          kickoffAt: match.kickoffAt,
        })),
      };
    }),
  );
  const blogPosts = blogRows.map((post) => ({
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    status: post.status,
    coverImagePath: post.coverImagePath,
  }));
  const settings = settingsRows[0] ?? {
    contactEmail: "",
    contactPhone: "",
    whatsappNumber: "",
    instagramUrl: "",
    facebookUrl: "",
    xUrl: "",
    announcement: "",
    sportyBetUrl: "https://www.sportybet.com/",
  };

  res.json({
    version: 1,
    exportedAt: new Date(),
    predictions,
    blogPosts,
    settings: {
      contactEmail: settings.contactEmail,
      contactPhone: settings.contactPhone,
      whatsappNumber: settings.whatsappNumber,
      instagramUrl: settings.instagramUrl,
      facebookUrl: settings.facebookUrl,
      xUrl: settings.xUrl,
      announcement: settings.announcement,
      sportyBetUrl: settings.sportyBetUrl,
    },
  });
});

router.post("/admin/import", requireAdmin, async (req, res): Promise<void> => {
  if (Buffer.byteLength(JSON.stringify(req.body), "utf8") > 4 * 1024 * 1024) {
    res.status(400).json({ error: "Backup exceeds the 4 MB import limit." });
    return;
  }
  const parsed = ImportBackupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.delete(predictionsTable);
    await tx.delete(blogPostsTable);

    for (const prediction of parsed.data.predictions) {
      const [created] = await tx
        .insert(predictionsTable)
        .values({
          title: prediction.title,
          slug: prediction.slug,
          category: prediction.category,
          risk: prediction.risk,
          status: prediction.status,
          result: prediction.result,
          bookingCode: prediction.bookingCode ?? null,
          analysis: prediction.analysis ?? null,
          imagePath: prediction.imagePath ?? null,
          combinedOddsOverride:
            prediction.combinedOddsOverride == null
              ? null
              : String(prediction.combinedOddsOverride),
          publishedAt:
            prediction.status === "published" ? new Date() : null,
        })
        .returning();

      await tx.insert(predictionMatchesTable).values(
        prediction.matches.map((match, sortOrder) => ({
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
      if (prediction.result !== "pending") {
        await tx.insert(predictionResultEventsTable).values({
          predictionId: created.id,
          result: prediction.result,
        });
      }
    }

    for (const post of parsed.data.blogPosts) {
      await tx.insert(blogPostsTable).values({
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: post.content,
        status: post.status,
        coverImagePath: post.coverImagePath ?? null,
        publishedAt: post.status === "published" ? new Date() : null,
      });
    }

    await tx
      .insert(siteSettingsTable)
      .values({ id: "primary", ...parsed.data.settings })
      .onConflictDoUpdate({
        target: siteSettingsTable.id,
        set: { ...parsed.data.settings, updatedAt: new Date() },
      });
  });

  res.json(
    ImportBackupResponse.parse({
      message: "Backup imported successfully.",
    }),
  );
});

export default router;
