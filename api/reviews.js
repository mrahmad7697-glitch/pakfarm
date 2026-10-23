import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";

const pool = globalThis.__pakFarmReviewPool || (globalThis.__pakFarmReviewPool = mysql.createPool(process.env.DATABASE_URL || process.env.DRIZZLE_DATABASE_URL || ""));
const tableReady = globalThis.__pakFarmReviewTableReady || (globalThis.__pakFarmReviewTableReady = pool.execute(`
  CREATE TABLE IF NOT EXISTS review_submissions (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    review TEXT NOT NULL,
    submitted_at DATETIME(3) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    INDEX review_submissions_status_idx (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`));

function send(res, status, payload) {
  res.status(status).setHeader("Cache-Control", "no-store").json(payload);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Method not allowed" });
  }
  if (!process.env.DATABASE_URL && !process.env.DRIZZLE_DATABASE_URL) {
    return send(res, 503, { error: "Review storage is not configured yet." });
  }

  try {
    await tableReady;
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    const review = typeof payload.review === "string" ? payload.review.trim() : "";
    if (!name || !review) return send(res, 400, { error: "Your name and review are required." });
    if (name.length > 120 || review.length > 2000) {
      return send(res, 400, { error: "Please keep your name and review within the allowed length." });
    }
    await pool.execute(
      "INSERT INTO review_submissions (id, name, review, submitted_at, status) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), name, review, new Date(), "pending"]
    );
    return send(res, 201, { message: "Thank you! Your review has been submitted." });
  } catch (error) {
    console.error("Review submission failed:", error);
    return send(res, 500, { error: "We could not save that review. Please try again." });
  }
}
