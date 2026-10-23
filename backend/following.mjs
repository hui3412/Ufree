// Authenticated username discovery and explicit, mutual personal-schedule sharing.
export async function followRequests(db, userId, rows) {
  return rows(
    db,
    "SELECT c.id,u.username AS sender,u.nickname,c.created_at AS createdAt FROM connections c JOIN users u ON u.id=c.requester_id WHERE c.recipient_id=? AND c.status='pending' ORDER BY c.created_at LIMIT 100",
    userId,
  );
}
export async function following(
  request,
  db,
  user,
  input,
  { one, rows, run, statement, throttle, fail },
) {
  const path = new URL(request.url).pathname;
  const unavailable = async (target) =>
    one(
      db,
      "SELECT 1 FROM blocks WHERE (user_id=? AND blocked_id=?) OR (user_id=? AND blocked_id=?)",
      user.id,
      target,
      target,
      user.id,
    );
  const count = async (id) =>
    (
      await one(
        db,
        "SELECT count(*) AS n FROM connections WHERE status IN ('pending','accepted') AND (requester_id=? OR recipient_id=?)",
        id,
        id,
      )
    ).n;
  const hasPersonal = async (id) =>
    !!(await one(
      db,
      "SELECT 1 FROM personal_schedule_exports WHERE owner_id=? AND payload IS NOT NULL",
      id,
    ));
  if (path === "/users/search" && input) {
    await throttle(db, `search:${user.id}`, 60, 3600000);
    const query =
      typeof input.query === "string" ? input.query.trim().toLowerCase() : "";
    if (!/^[a-z0-9_]{1,24}$/.test(query))
      fail("Search using 1–24 username letters, numbers or underscores.");
    const found = await rows(
      db,
      `SELECT u.username,u.nickname,c.id AS connectionId,c.status,c.requester_id FROM users u
      LEFT JOIN connections c ON (c.requester_id=? AND c.recipient_id=u.id) OR (c.recipient_id=? AND c.requester_id=u.id)
      WHERE u.id<>? AND instr(u.username,?)>0 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.user_id=? AND b.blocked_id=u.id) OR (b.user_id=u.id AND b.blocked_id=?))
      ORDER BY CASE WHEN u.username=? THEN 0 WHEN instr(u.username,?)=1 THEN 1 ELSE 2 END,u.username COLLATE NOCASE LIMIT 10`,
      user.id,
      user.id,
      user.id,
      query,
      user.id,
      user.id,
      query,
      query,
    );
    return {
      users: found.map((row) => ({
        username: row.username,
        nickname: row.nickname || "",
        connection:
          row.status === "pending" || row.status === "accepted"
            ? {
                id: row.connectionId,
                status: row.status,
                direction:
                  row.requester_id === user.id ? "outgoing" : "incoming",
              }
            : null,
      })),
    };
  }
  if (path === "/connections" && request.method === "GET") {
    const list = await rows(
      db,
      `SELECT c.id,c.status,c.requester_id,u.username,u.nickname FROM connections c JOIN users u ON u.id=CASE WHEN c.requester_id=? THEN c.recipient_id ELSE c.requester_id END
      WHERE (c.requester_id=? OR c.recipient_id=?) AND c.status IN ('pending','accepted') ORDER BY c.status,u.username`,
      user.id,
      user.id,
      user.id,
    );
    return {
      connections: list.map((row) => ({
        id: row.id,
        username: row.username,
        nickname: row.nickname || "",
        status: row.status,
        direction: row.requester_id === user.id ? "outgoing" : "incoming",
      })),
    };
  }
  if (path === "/connections/request" && input) {
    if (input.sharePersonal !== true)
      fail("Confirm ongoing sharing of your personal schedule.");
    if (
      typeof input.username !== "string" ||
      !/^[A-Za-z0-9_]{3,24}$/.test(input.username)
    )
      fail("Enter a username.");
    const target = await one(
      db,
      "SELECT id,username FROM users WHERE username=?",
      input.username.toLowerCase(),
    );
    if (!target || target.id === user.id || (await unavailable(target.id)))
      fail("Recipient unavailable.");
    if (!(await hasPersonal(user.id)))
      fail("Select and sync your personal schedule before following someone.");
    const pair = [user.id, target.id].sort().join(":");
    const existing = await one(
      db,
      "SELECT * FROM connections WHERE pair_key=?",
      pair,
    );
    if (existing?.status === "accepted" || existing?.status === "pending")
      fail("A follow request or connection already exists.", 409);
    if (existing && Date.now() - existing.created_at < 86400000)
      fail(
        "Wait 24 hours before sending another follow request to this person.",
        429,
      );
    if ((await count(user.id)) >= 100 || (await count(target.id)) >= 100)
      fail("The connection limit has been reached.");
    await throttle(db, `follow:${user.id}`, 20, 86400000);
    await throttle(db, `follow-inbox:${target.id}`, 50, 86400000);
    const id = existing?.id || crypto.randomUUID();
    if (existing) {
      const result = await one(
        db,
        "UPDATE connections SET requester_id=?,recipient_id=?,status='pending',created_at=? WHERE id=? AND status IN ('declined','removed') RETURNING id",
        user.id,
        target.id,
        Date.now(),
        id,
      );
      if (!result) fail("A follow request or connection already exists.", 409);
    } else
      await run(
        db,
        "INSERT INTO connections(id,requester_id,recipient_id,pair_key,status,created_at) VALUES(?,?,?,?,'pending',?)",
        id,
        user.id,
        target.id,
        pair,
        Date.now(),
      );
    return { ok: true, id };
  }
  if (path === "/connections/respond" && input) {
    if (!["accepted", "declined"].includes(input.decision))
      fail("Choose Accept or Decline.");
    const connection = await one(
      db,
      "SELECT * FROM connections WHERE id=? AND recipient_id=? AND status='pending'",
      input.id,
      user.id,
    );
    if (!connection) fail("This follow request is no longer pending.", 409);
    if (input.decision === "accepted") {
      if (input.sharePersonal !== true)
        fail("Confirm ongoing sharing of your personal schedule.");
      if (await unavailable(connection.requester_id))
        fail("Recipient unavailable.");
      if (
        !(await hasPersonal(user.id)) ||
        !(await hasPersonal(connection.requester_id))
      )
        fail("Both people need a synced personal schedule before sharing.");
    }
    const result = await one(
      db,
      "UPDATE connections SET status=? WHERE id=? AND recipient_id=? AND status='pending' RETURNING id",
      input.decision,
      input.id,
      user.id,
    );
    if (!result) fail("This follow request is no longer pending.", 409);
    return { ok: true };
  }
  if (path === "/connections/remove" && input) {
    await run(
      db,
      "UPDATE connections SET status='removed' WHERE id=? AND (requester_id=? OR recipient_id=?) AND status IN ('pending','accepted')",
      input.id,
      user.id,
      user.id,
    );
    return { ok: true };
  }
  if (path === "/profile/personal-schedule" && input) fail("Edit your attached schedule in Profile.",410);
  return null;
}
