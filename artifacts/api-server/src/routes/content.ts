import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { Router, type IRouter } from "express";
import {
  CreateBlogPostBody,
  CreateBlogPostResponse,
  DeleteBlogPostParams,
  GetBlogPostParams,
  GetBlogPostResponse,
  GetPublicSettingsResponse,
  ListAdminContactMessagesResponse,
  ListAdminBlogPostsResponse,
  ListBlogPostsResponse,
  SendContactMessageBody,
  SendContactMessageResponse,
  UpdateBlogPostBody,
  UpdateBlogPostParams,
  UpdateBlogPostResponse,
  UpdateSiteSettingsBody,
  UpdateSiteSettingsResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  blogPostsTable,
  contactMessagesTable,
  siteSettingsTable,
} from "@workspace/db/schema";
import { requireAdmin } from "../middlewares/requireAdmin";

const router: IRouter = Router();

const defaultSettings = {
  contactEmail: "",
  contactPhone: "",
  whatsappNumber: "",
  instagramUrl: "",
  facebookUrl: "",
  xUrl: "",
  announcement: "",
  sportyBetUrl: "https://www.sportybet.com/",
};

function toBlogPost(row: typeof blogPostsTable.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: row.content,
    status: row.status,
    publishedAt: row.publishedAt,
    coverImagePath: row.coverImagePath,
  };
}

function validExternalLink(value: string, label: string): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return `${label} must use http or https.`;
    return null;
  } catch {
    return `${label} must be a valid URL.`;
  }
}

router.get("/settings", async (_req, res): Promise<void> => {
  const [settings] = await db.select().from(siteSettingsTable).limit(1);
  res.json(
    GetPublicSettingsResponse.parse(
      settings
        ? {
            contactEmail: settings.contactEmail,
            contactPhone: settings.contactPhone,
            whatsappNumber: settings.whatsappNumber,
            instagramUrl: settings.instagramUrl,
            facebookUrl: settings.facebookUrl,
            xUrl: settings.xUrl,
            announcement: settings.announcement,
            sportyBetUrl: settings.sportyBetUrl,
          }
        : defaultSettings,
    ),
  );
});

router.put("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateSiteSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const linkError =
    validExternalLink(parsed.data.instagramUrl, "Instagram link") ??
    validExternalLink(parsed.data.facebookUrl, "Facebook link") ??
    validExternalLink(parsed.data.xUrl, "X link") ??
    validExternalLink(parsed.data.sportyBetUrl, "SportyBet link");
  if (linkError) {
    res.status(400).json({ error: linkError });
    return;
  }

  const [updated] = await db
    .insert(siteSettingsTable)
    .values({ id: "primary", ...parsed.data })
    .onConflictDoUpdate({
      target: siteSettingsTable.id,
      set: { ...parsed.data, updatedAt: new Date() },
    })
    .returning();

  res.json(
    UpdateSiteSettingsResponse.parse({
      contactEmail: updated.contactEmail,
      contactPhone: updated.contactPhone,
      whatsappNumber: updated.whatsappNumber,
      instagramUrl: updated.instagramUrl,
      facebookUrl: updated.facebookUrl,
      xUrl: updated.xUrl,
      announcement: updated.announcement,
      sportyBetUrl: updated.sportyBetUrl,
    }),
  );
});

router.get("/blog", async (_req, res): Promise<void> => {
  const posts = await db
    .select()
    .from(blogPostsTable)
    .where(
      and(
        eq(blogPostsTable.status, "published"),
        isNotNull(blogPostsTable.publishedAt),
      ),
    )
    .orderBy(desc(blogPostsTable.publishedAt));
  res.json(ListBlogPostsResponse.parse(posts.map(toBlogPost)));
});

router.get("/blog/:slug", async (req, res): Promise<void> => {
  const parsed = GetBlogPostParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [post] = await db
    .select()
    .from(blogPostsTable)
    .where(
      and(
        eq(blogPostsTable.slug, parsed.data.slug),
        eq(blogPostsTable.status, "published"),
        isNotNull(blogPostsTable.publishedAt),
      ),
    )
    .limit(1);
  if (!post) {
    res.status(404).json({ error: "Blog post not found." });
    return;
  }
  res.json(GetBlogPostResponse.parse(toBlogPost(post)));
});

router.get("/admin/blog", requireAdmin, async (_req, res): Promise<void> => {
  const posts = await db
    .select()
    .from(blogPostsTable)
    .orderBy(asc(blogPostsTable.createdAt));
  res.json(ListAdminBlogPostsResponse.parse(posts.map(toBlogPost)));
});

router.post("/admin/blog", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateBlogPostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [post] = await db
    .insert(blogPostsTable)
    .values({
      title: parsed.data.title,
      slug: parsed.data.slug,
      excerpt: parsed.data.excerpt,
      content: parsed.data.content,
      status: parsed.data.status,
      coverImagePath: parsed.data.coverImagePath ?? null,
      publishedAt: parsed.data.status === "published" ? new Date() : null,
    })
    .returning();
  res.status(201).json(CreateBlogPostResponse.parse(toBlogPost(post)));
});

router.patch(
  "/admin/blog/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateBlogPostParams.safeParse(req.params);
    const body = UpdateBlogPostBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [current] = await db
      .select()
      .from(blogPostsTable)
      .where(eq(blogPostsTable.id, params.data.id))
      .limit(1);
    if (!current) {
      res.status(404).json({ error: "Blog post not found." });
      return;
    }

    const [post] = await db
      .update(blogPostsTable)
      .set({
        title: body.data.title,
        slug: body.data.slug,
        excerpt: body.data.excerpt,
        content: body.data.content,
        status: body.data.status,
        coverImagePath: body.data.coverImagePath ?? null,
        publishedAt:
          body.data.status === "published"
            ? current.publishedAt ?? new Date()
            : current.publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(blogPostsTable.id, params.data.id))
      .returning();
    res.json(UpdateBlogPostResponse.parse(toBlogPost(post)));
  },
);

router.delete(
  "/admin/blog/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteBlogPostParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const deleted = await db
      .delete(blogPostsTable)
      .where(eq(blogPostsTable.id, params.data.id))
      .returning({ id: blogPostsTable.id });
    if (!deleted.length) {
      res.status(404).json({ error: "Blog post not found." });
      return;
    }
    res.status(204).end();
  },
);

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many messages. Please try again later." },
});

router.post(
  "/contact",
  contactLimiter,
  async (req, res): Promise<void> => {
    const parsed = SendContactMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (parsed.data.website?.trim()) {
      res.status(400).json({ error: "Message could not be accepted." });
      return;
    }

    await db.insert(contactMessagesTable).values({
      name: parsed.data.name,
      email: parsed.data.email,
      subject: parsed.data.subject,
      message: parsed.data.message,
    });
    res.status(201).json(
      SendContactMessageResponse.parse({
        message: "Your message was received. The OlaFlex team will follow up.",
      }),
    );
  },
);

router.get(
  "/admin/contact-messages",
  requireAdmin,
  async (_req, res): Promise<void> => {
    const messages = await db
      .select()
      .from(contactMessagesTable)
      .orderBy(desc(contactMessagesTable.createdAt))
      .limit(200);
    res.json(
      ListAdminContactMessagesResponse.parse(
        messages.map((message) => ({
          id: message.id,
          name: message.name,
          email: message.email,
          subject: message.subject,
          message: message.message,
          createdAt: message.createdAt,
        })),
      ),
    );
  },
);

export default router;
