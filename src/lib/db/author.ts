import type { D1Database } from '@cloudflare/workers-types';
import { logger } from '../utils/logger';

export interface AuthorRecord {
  id: number;
  name: string;
  role_title: string;
  bio: string;
  avatar_url: string | null;
  avatar_r2_key: string | null;
  social_instagram: string | null;
  social_pinterest: string | null;
  social_youtube: string | null;
  social_facebook: string | null;
  social_twitter: string | null;
  website_url: string | null;
  email: string | null;
  is_default: number;
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_AUTHOR_DATA: Omit<AuthorRecord, 'id'> = {
  name: 'BananaBread Baker',
  role_title: 'Head Baker & Recipe Developer',
  bio: 'Welcome! I am a passionate home baker dedicated to developing tried-and-true, foolproof banana bread and pastry recipes tested to absolute golden perfection.',
  avatar_url: null,
  avatar_r2_key: null,
  social_instagram: 'https://instagram.com',
  social_pinterest: 'https://pinterest.com',
  social_youtube: 'https://youtube.com',
  social_facebook: null,
  social_twitter: null,
  website_url: null,
  email: null,
  is_default: 1
};

export async function ensureAuthorTable(db: D1Database): Promise<void> {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS authors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT 'BananaBread Baker',
        role_title TEXT DEFAULT 'Head Baker & Recipe Developer',
        bio TEXT,
        avatar_url TEXT,
        avatar_r2_key TEXT,
        social_instagram TEXT,
        social_pinterest TEXT,
        social_youtube TEXT,
        social_facebook TEXT,
        social_twitter TEXT,
        website_url TEXT,
        email TEXT,
        is_default INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `).run();

    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_authors_default ON authors(is_default);
    `).run();
  } catch (err) {
    logger.warn('[Author DB] ensureAuthorTable note:', err);
  }
}

export async function getDefaultAuthor(db: D1Database): Promise<AuthorRecord> {
  await ensureAuthorTable(db);

  let author = await db
    .prepare('SELECT * FROM authors WHERE is_default = 1 ORDER BY id ASC LIMIT 1')
    .first<AuthorRecord>();

  if (!author) {
    // Seed the default author
    const insertRes = await db
      .prepare(`
        INSERT INTO authors (
          name, role_title, bio, avatar_url, avatar_r2_key,
          social_instagram, social_pinterest, social_youtube,
          social_facebook, social_twitter, website_url, email, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `)
      .bind(
        DEFAULT_AUTHOR_DATA.name,
        DEFAULT_AUTHOR_DATA.role_title,
        DEFAULT_AUTHOR_DATA.bio,
        DEFAULT_AUTHOR_DATA.avatar_url,
        DEFAULT_AUTHOR_DATA.avatar_r2_key,
        DEFAULT_AUTHOR_DATA.social_instagram,
        DEFAULT_AUTHOR_DATA.social_pinterest,
        DEFAULT_AUTHOR_DATA.social_youtube,
        DEFAULT_AUTHOR_DATA.social_facebook,
        DEFAULT_AUTHOR_DATA.social_twitter,
        DEFAULT_AUTHOR_DATA.website_url,
        DEFAULT_AUTHOR_DATA.email
      )
      .run();

    const authorId = insertRes.meta?.last_row_id || 1;
    author = await db
      .prepare('SELECT * FROM authors WHERE id = ?')
      .bind(authorId)
      .first<AuthorRecord>();
  }

  return author || {
    id: 1,
    ...DEFAULT_AUTHOR_DATA
  };
}

export async function updateAuthor(
  db: D1Database,
  authorId: number,
  data: Partial<AuthorRecord>
): Promise<AuthorRecord> {
  await ensureAuthorTable(db);

  const existing = await db
    .prepare('SELECT * FROM authors WHERE id = ?')
    .bind(authorId)
    .first<AuthorRecord>();

  if (!existing) {
    throw new Error(`Author #${authorId} not found`);
  }

  const updatedName = data.name !== undefined ? data.name.trim() : existing.name;
  const updatedRole = data.role_title !== undefined ? data.role_title.trim() : existing.role_title;
  const updatedBio = data.bio !== undefined ? data.bio.trim() : existing.bio;
  const updatedAvatarUrl = data.avatar_url !== undefined ? (data.avatar_url ? data.avatar_url.trim() : null) : existing.avatar_url;
  const updatedAvatarKey = data.avatar_r2_key !== undefined ? data.avatar_r2_key : existing.avatar_r2_key;
  const updatedInstagram = data.social_instagram !== undefined ? (data.social_instagram ? data.social_instagram.trim() : null) : existing.social_instagram;
  const updatedPinterest = data.social_pinterest !== undefined ? (data.social_pinterest ? data.social_pinterest.trim() : null) : existing.social_pinterest;
  const updatedYoutube = data.social_youtube !== undefined ? (data.social_youtube ? data.social_youtube.trim() : null) : existing.social_youtube;
  const updatedFacebook = data.social_facebook !== undefined ? (data.social_facebook ? data.social_facebook.trim() : null) : existing.social_facebook;
  const updatedTwitter = data.social_twitter !== undefined ? (data.social_twitter ? data.social_twitter.trim() : null) : existing.social_twitter;
  const updatedWebsite = data.website_url !== undefined ? (data.website_url ? data.website_url.trim() : null) : existing.website_url;
  const updatedEmail = data.email !== undefined ? (data.email ? data.email.trim() : null) : existing.email;

  await db
    .prepare(`
      UPDATE authors SET
        name = ?,
        role_title = ?,
        bio = ?,
        avatar_url = ?,
        avatar_r2_key = ?,
        social_instagram = ?,
        social_pinterest = ?,
        social_youtube = ?,
        social_facebook = ?,
        social_twitter = ?,
        website_url = ?,
        email = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `)
    .bind(
      updatedName,
      updatedRole,
      updatedBio,
      updatedAvatarUrl,
      updatedAvatarKey,
      updatedInstagram,
      updatedPinterest,
      updatedYoutube,
      updatedFacebook,
      updatedTwitter,
      updatedWebsite,
      updatedEmail,
      authorId
    )
    .run();

  const refreshed = await db
    .prepare('SELECT * FROM authors WHERE id = ?')
    .bind(authorId)
    .first<AuthorRecord>();

  return refreshed!;
}
