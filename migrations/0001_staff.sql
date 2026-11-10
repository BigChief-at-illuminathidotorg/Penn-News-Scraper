CREATE TABLE IF NOT EXISTS staff (email TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('pending','approved','denied','revoked')), requested_at TEXT NOT NULL, reviewed_at TEXT, reviewed_by TEXT);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dispatch_lock (id INTEGER PRIMARY KEY, expires INTEGER NOT NULL);
