// src/middleware/audit.middleware.js

export const audit = (options = {}) => {
  const label = options.label || "AUDIT";

  return (req, res, next) => {
    const start = process.hrtime.bigint();
    const meta = {
      method: req.method,
      path: req.originalUrl || req.url,
      user_id: req.user?.user_id ?? null,
      role: req.user?.role ?? null,
      barangay_id: req.user?.barangay_id ?? null,
      ip:
        req.headers["x-forwarded-for"] ||
        req.ip ||
        req.connection?.remoteAddress ||
        null,
      timestamp: new Date().toISOString(),
    };

    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      console.log(
        `[${label}] ${meta.method} ${meta.path} ${res.statusCode} ${durationMs.toFixed(2)}ms`,
        {
          user_id: meta.user_id,
          role: meta.role,
          barangay_id: meta.barangay_id,
          ip: meta.ip,
          status: res.statusCode,
        },
      );
    });

    req.audit = meta;
    next();
  };
};
