
const crypto = require("crypto");
const path = require("path");
const { pool, query } = require("../config/database");
const {
  sendSubmissionEmail,
  isConfigured,
  EMAIL_TO
} = require("../services/emailService");

const IST = "Asia/Kolkata";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function safeName(name) {
  return (
    path
      .basename(String(name || "file"))
      .replace(/[^a-zA-Z0-9._ -]/g, "_")
      .slice(0, 500) || "file"
  );
}

function istParts() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const result = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  }

  return Object.fromEntries(
    Object.entries(result).map(([key, value]) => [key, Number(value)])
  );
}

function createOrderId() {
  const date = istParts();

  return `AH${String(date.hour).padStart(2, "0")}${String(
    date.minute
  ).padStart(2, "0")}${String(date.day).padStart(2, "0")}${String(
    date.month
  ).padStart(2, "0")}${String(date.year).slice(-2)}`;
}

async function newOrderId(client) {
  const orderId = createOrderId();

  const result = await client.query(
    "SELECT 1 FROM submissions WHERE order_id=$1 LIMIT 1",
    [orderId]
  );

  if (!result.rows.length) {
    return orderId;
  }

  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 60));

    const nextOrderId = createOrderId();

    const check = await client.query(
      "SELECT 1 FROM submissions WHERE order_id=$1 LIMIT 1",
      [nextOrderId]
    );

    if (!check.rows.length) {
      return nextOrderId;
    }
  }

  throw new Error("Could not create a unique order ID.");
}

function validDate(value) {
  const stringValue = String(value || "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(stringValue)) {
    return false;
  }

  const [year, month, day] = stringValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validHour(value) {
  if (!/^\d{2}:00$/.test(String(value || ""))) {
    return false;
  }

  const hour = Number(String(value).slice(0, 2));

  return hour >= 0 && hour <= 23;
}

function validateDeadline(date, time) {
  date = String(date || "").trim();
  time = String(time || "").trim();

  if (!validDate(date)) {
    return {
      valid: false,
      message: "Invalid deadline date."
    };
  }

  if (!validHour(time)) {
    return {
      valid: false,
      message: "Invalid deadline hour. Use HH:00."
    };
  }

  const now = istParts();

  const today = `${now.year}-${String(now.month).padStart(
    2,
    "0"
  )}-${String(now.day).padStart(2, "0")}`;

  if (date < today) {
    return {
      valid: false,
      message: "Deadline cannot be in the past."
    };
  }

  if (date === today && Number(time.slice(0, 2)) <= now.hour) {
    return {
      valid: false,
      message: "Please select a future hour in IST."
    };
  }

  return {
    valid: true
  };
}

function formatDeadline(date, time) {
  try {
    if (!date) return "";

    const dateString =
      date instanceof Date
        ? `${date.getUTCFullYear()}-${String(
            date.getUTCMonth() + 1
          ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
        : String(date).slice(0, 10);

    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!match) {
      return String(date);
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return String(date);
    }

    const hourMatch = /^\d{1,2}/.exec(String(time || ""));
    const hour = hourMatch
      ? String(Number(hourMatch[0])).padStart(2, "0")
      : "00";

    return `${String(day).padStart(2, "0")} ${
      MONTHS[month - 1]
    } ${year} ${hour}:00 IST`;
  } catch {
    return String(date || "");
  }
}

/*
 * Gets the visitor IP from the request.
 *
 * Render and other reverse proxies may provide x-forwarded-for.
 * The first IP in that header is normally the original client IP.
 */
function clientIp(req) {
  // Railway and other reverse proxies can expose the real visitor through
  // several headers. Prefer the first PUBLIC address, not blindly the first
  // x-forwarded-for value (which can itself be an internal proxy address).
  const candidates = [
    req.headers["cf-connecting-ip"],
    req.headers["true-client-ip"],
    req.headers["x-real-ip"],
    req.headers["x-client-ip"],
    req.headers["x-forwarded-for"],
    req.ip,
    req.socket?.remoteAddress
  ].flatMap(value => String(value || "").split(",").map(v => v.trim()))
   .map(ip => ip.replace(/^::ffff:/, "").replace(/^::1$/, "127.0.0.1").trim())
   .filter(Boolean);

  return candidates.find(publicIp) || candidates[0] || "";
}

function publicIp(ip) {
  if (!ip) return false;

  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "0.0.0.0" ||
    ip === "localhost"
  ) {
    return false;
  }

  if (
    /^(10\.|192\.168\.|169\.254\.)/.test(ip) ||
    /^(fc|fd|fe80:)/i.test(ip)
  ) {
    return false;
  }

  const parts = ip.split(".").map(Number);

  if (
    parts.length === 4 &&
    parts[0] === 172 &&
    parts[1] >= 16 &&
    parts[1] <= 31
  ) {
    return false;
  }

  return true;
}

function countryFromHeaders(req) {
  const codeHeaders = [
    req.headers["cf-ipcountry"],
    req.headers["x-country-code"],
    req.headers["x-vercel-ip-country"],
    req.headers["x-geo-country"],
    req.headers["x-railway-country"],
    req.headers["x-country"]
  ];

  for (const value of codeHeaders) {
    const code = String(value || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code) && code !== "XX") {
      let name = "";
      try {
        name = new Intl.DisplayNames(["en"], { type: "region" }).of(code) || "";
      } catch {}
      return { name, code };
    }
  }

  const name = String(req.headers["x-country"] || "").trim();
  if (name) return { name, code: "" };

  return { name: "", code: "" };
}

function normalizeGeo(data) {
  if (!data || data.error) return null;

  const code = String(
    data.country_code ||
    data.country_code_iso2 ||
    data.countryCode ||
    data.country ||
    ""
  ).trim().toUpperCase().slice(0, 2);

  const name = String(
    data.country_name ||
    data.country ||
    data.countryName ||
    ""
  ).trim();

  let resolvedName = name;
  if (!resolvedName && /^[A-Z]{2}$/.test(code)) {
    try {
      resolvedName = new Intl.DisplayNames(["en"], { type: "region" }).of(code) || "";
    } catch {}
  }

  if (!resolvedName && !/^[A-Z]{2}$/.test(code)) return null;
  return { name: resolvedName || "Unknown", code: /^[A-Z]{2}$/.test(code) ? code : "" };
}

async function fetchJson(url, timeoutMs = 1400) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function lookupCountry(ip, headerGeo = null) {
  if (headerGeo && (headerGeo.code || headerGeo.name)) {
    return {
      name: headerGeo.name || "Unknown",
      code: headerGeo.code || ""
    };
  }

  if (!publicIp(ip)) return { name: "Local / Unknown", code: "" };

  // Use two independent no-key providers in parallel. The first valid result
  // wins, which avoids leaving real production submissions stuck at Unknown
  // when one public geolocation endpoint is rate-limited.
  const providers = [
    `https://ipapi.co/${encodeURIComponent(ip)}/json/`,
    `https://ipwho.is/${encodeURIComponent(ip)}`,
    `https://api.country.is/${encodeURIComponent(ip)}`
  ];

  const results = await Promise.allSettled(providers.map(url => fetchJson(url)));
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const geo = normalizeGeo(result.value);
    if (geo) return geo;
  }

  return { name: "Unknown", code: "" };
}

function map(row) {
  return {
    SubmissionId: Number(row.id),
    Id: row.order_id || row.id,
    Name: row.name || "",
    Email: row.email || "",
    Phone: row.phone || "",
    Subject: row.subject || "",
    DeadlineDate: row.deadline_date
      ? String(row.deadline_date).slice(0, 10)
      : "",
    DeadlineTime: row.deadline_time
      ? String(row.deadline_time).slice(0, 5)
      : "",
    Deadline: formatDeadline(row.deadline_date, row.deadline_time),
    Country: row.country || "Unknown",
    CountryCode: String(row.country_code || "").toUpperCase(),
    ClientIP: row.client_ip || "",
    AssignmentDetails: row.assignment_details || "",
    Status: row.status || "New",
    CreatedAt: row.created_at || null,
    UpdatedAt: row.updated_at || null,
    AttachmentCount: Number(row.attachment_count || 0)
  };
}

async function createSubmission(req, res) {
  const {
    name,
    email,
    phone,
    subject,
    deadline_date,
    deadline_time,
    message
  } = req.body || {};

  // receiveFiles() uses upload.array("assignmentFiles"), so req.files
  // is already the complete attachment array.
  const files = Array.isArray(req.files) ? req.files : [];

  if (
    !String(name || "").trim() ||
    !String(email || "").trim() ||
    !String(subject || "").trim() ||
    !deadline_date ||
    !deadline_time ||
    !String(message || "").trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "Please complete all required fields."
    });
  }

  const deadlineCheck = validateDeadline(deadline_date, deadline_time);

  if (!deadlineCheck.valid) {
    return res.status(400).json({
      success: false,
      message: deadlineCheck.message
    });
  }

  const ip = clientIp(req);
  const headerGeo = countryFromHeaders(req);
  const geoPromise = lookupCountry(ip, headerGeo);

  console.log("[IP DEBUG]", {
    ip,
    forwardedFor: req.headers["x-forwarded-for"] || null,
    remoteAddress: req.socket?.remoteAddress || null
  });

  // Resolve the country before the database insert completes so the admin
  // panel can show the flag immediately on its next refresh. The lookup has a
  // short timeout and runs in parallel with the request preparation.
  const geo = await geoPromise;
  const initialCountry = geo.name || (publicIp(ip) ? "Unknown" : "Local / Unknown");
  const initialCountryCode = geo.code || null;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderId = await newOrderId(client);

    const result = await client.query(
      `
        INSERT INTO submissions
        (
          order_id,
          name,
          email,
          phone,
          subject,
          deadline_date,
          deadline_time,
          assignment_details,
          client_ip,
          country,
          country_code,
          status
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'New')
        RETURNING id, order_id
      `,
      [
        orderId,
        String(name).trim(),
        String(email).trim(),
        phone ? String(phone).trim() : null,
        String(subject).trim(),
        deadline_date,
        deadline_time,
        String(message).trim(),
        ip || null,
        initialCountry,
        initialCountryCode
      ]
    );

    const submissionId = Number(result.rows[0].id);

    // Insert all attachments in one database query.
    if (files.length) {
      const values = [];
      const parameters = [];

      files.forEach((file, index) => {
        const originalName = safeName(file.originalname);
        const storedName = `${crypto.randomUUID()}-${originalName}`;
        const base = index * 7;

        values.push(
          `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7})`
        );

        parameters.push(
          submissionId,
          originalName,
          storedName,
          `${submissionId}/${storedName}`,
          file.mimetype || "application/octet-stream",
          Number(file.size || file.buffer.length),
          file.buffer
        );
      });

      await client.query(
        `
          INSERT INTO submission_files
          (
            submission_id,
            original_file_name,
            stored_file_name,
            file_path,
            mime_type,
            file_size,
            data
          )
          VALUES ${values.join(",")}
        `,
        parameters
      );
    }

    await client.query("COMMIT");

    // Email remains outside the response path for faster submission.
    if (isConfigured()) {
      setImmediate(() => {
        sendSubmissionEmail({
          submissionId,
          orderId,
          fields: {
            name,
            email,
            phone,
            subject,
            deadline_date,
            deadline_time,
            message,
            country: initialCountry,
            clientIp: ip
          },
          files
        }).catch((error) => {
          console.error("Submission email error:", error.message);
        });
      });
    }

    return res.status(201).json({
      success: true,
      message: "Thanks! Your Requirements Was Submitted.",
      submissionId,
      orderId,
      deadline: formatDeadline(deadline_date, deadline_time),
      country: initialCountry,
      countryCode: initialCountryCode || "",
      clientIp: ip,
      attachmentCount: files.length
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    console.error("CREATE SUBMISSION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to save the submission."
    });
  } finally {
    client.release();
  }
}

async function listSubmissions(req, res) {
  try {
    const result = await query(`
      SELECT
        s.*,
        COUNT(f.id)::int AS attachment_count
      FROM submissions s
      LEFT JOIN submission_files f
        ON f.submission_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);

    return res.json({
      success: true,
      submissions: result.rows.map(map)
    });
  } catch (error) {
    console.error("LIST SUBMISSIONS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load submissions."
    });
  }
}

async function getSubmission(req, res) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid submission ID."
      });
    }

    const submission = await query(
      "SELECT * FROM submissions WHERE id=$1 LIMIT 1",
      [id]
    );

    if (!submission.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Submission not found."
      });
    }

    const files = await query(
      `
        SELECT
          id,
          original_file_name,
          mime_type,
          file_size,
          created_at
        FROM submission_files
        WHERE submission_id=$1
        ORDER BY id
      `,
      [id]
    );

    return res.json({
      success: true,
      submission: map(submission.rows[0]),
      attachments: files.rows.map((file) => ({
        Id: Number(file.id),
        OriginalFileName: file.original_file_name,
        MimeType: file.mime_type || "application/octet-stream",
        FileSize: Number(file.file_size || 0),
        CreatedAt: file.created_at,
        ViewUrl: `/api/submissions/attachments/${file.id}/view`,
        DownloadUrl: `/api/submissions/attachments/${file.id}/download`
      }))
    });
  } catch (error) {
    console.error("GET SUBMISSION ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load submission."
    });
  }
}


async function resolveCountry(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ success: false, message: "Invalid submission ID." });
    }

    const result = await query(
      "SELECT id, client_ip, country, country_code FROM submissions WHERE id=$1 LIMIT 1",
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: "Submission not found." });
    }

    const row = result.rows[0];

    // The admin browser can supply a verified ISO country code when the
    // Railway server cannot reach a public GeoIP provider. This keeps the
    // server-side lookup as the first choice while giving existing records
    // a reliable fallback. Only the authenticated admin route can write it.
    const suppliedCode = String(req.body?.countryCode || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(suppliedCode) && suppliedCode !== "XX") {
      let suppliedName = "";
      try {
        suppliedName = new Intl.DisplayNames(["en"], { type: "region" }).of(suppliedCode) || "";
      } catch {}

      if (suppliedName) {
        await query(
          "UPDATE submissions SET country=$1, country_code=$2, updated_at=NOW() WHERE id=$3",
          [suppliedName, suppliedCode, id]
        );

        return res.json({
          success: true,
          country: suppliedName,
          countryCode: suppliedCode,
          source: "admin-browser"
        });
      }
    }

    const geo = await lookupCountry(row.client_ip);

    if (geo.name !== "Unknown" || geo.code) {
      await query(
        "UPDATE submissions SET country=$1, country_code=$2, updated_at=NOW() WHERE id=$3",
        [geo.name || "Unknown", geo.code || null, id]
      );
    }

    return res.json({
      success: true,
      country: geo.name || row.country || "Unknown",
      countryCode: geo.code || row.country_code || ""
    });
  } catch (error) {
    console.error("RESOLVE COUNTRY ERROR:", error);
    return res.status(500).json({ success: false, message: "Unable to resolve country." });
  }
}

async function sendAttachment(req, res, forceDownload = false) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).send("Invalid attachment ID.");
    }

    const result = await query(
      `
        SELECT original_file_name, mime_type, data
        FROM submission_files
        WHERE id=$1
        LIMIT 1
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).send("Attachment not found.");
    }

    const file = result.rows[0];

    if (!file.data || !file.data.length) {
      return res.status(404).send("Attachment data is empty.");
    }

    const fileName = safeName(file.original_file_name || "attachment");
    const mimeType = file.mime_type || "application/octet-stream";

    const download =
      forceDownload ||
      req.path.endsWith("/download") ||
      ["1", "true"].includes(
        String(req.query.download || "").toLowerCase()
      );

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private,no-store,max-age=0");
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Length", file.data.length);
    res.setHeader(
      "Content-Disposition",
      `${download ? "attachment" : "inline"}; filename="${fileName}"`
    );

    return res.end(file.data);
  } catch (error) {
    console.error("ATTACHMENT RETRIEVAL ERROR:", error);

    return res.status(500).send("Unable to retrieve attachment.");
  }
}

const viewAttachment = (req, res) =>
  sendAttachment(req, res, false);

const downloadAttachment = (req, res) =>
  sendAttachment(req, res, true);

async function updateStatus(req, res) {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || "");

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid submission ID."
      });
    }

    if (!["New", "In Progress", "Completed", "Cancelled"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status."
      });
    }

    const result = await query(
      `
        UPDATE submissions
        SET status=$1, updated_at=NOW()
        WHERE id=$2
        RETURNING order_id, status
      `,
      [status, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: "Submission not found."
      });
    }

    return res.json({
      success: true,
      message: "Status updated.",
      orderId: result.rows[0].order_id,
      status: result.rows[0].status
    });
  } catch (error) {
    console.error("STATUS UPDATE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update status."
    });
  }
}

module.exports = {
  createSubmission,
  listSubmissions,
  getSubmission,
  viewAttachment,
  downloadAttachment,
  getFile: downloadAttachment,
  updateStatus,
  resolveCountry,
  EMAIL_TO
};