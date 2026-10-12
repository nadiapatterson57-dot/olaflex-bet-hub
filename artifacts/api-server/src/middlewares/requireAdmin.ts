import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";

export type AdminIdentity = { userId: string; email: string };

export async function getAdminIdentity(
  req: Request,
): Promise<
  | { identity: AdminIdentity }
  | { status: 401 | 403 | 503; error: string }
> {
  const allowlistedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!allowlistedEmail) {
    return { status: 503, error: "Administrator access is not configured." };
  }

  const { userId } = getAuth(req);
  if (!userId) {
    return { status: 401, error: "Sign in to continue." };
  }

  const user = await clerkClient.users.getUser(userId);
  const primaryEmail = user.primaryEmailAddress;
  const email = primaryEmail?.emailAddress.trim().toLowerCase();

  if (
    !email ||
    email !== allowlistedEmail ||
    primaryEmail?.verification?.status !== "verified"
  ) {
    return { status: 403, error: "This account does not have administrator access." };
  }

  return { identity: { userId, email } };
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await getAdminIdentity(req);
    if ("status" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    (req as Request & { adminIdentity?: AdminIdentity }).adminIdentity =
      result.identity;
    next();
  } catch (error) {
    req.log.error({ err: error }, "Administrator authorization failed");
    res.status(500).json({ error: "Could not verify administrator access." });
  }
}
