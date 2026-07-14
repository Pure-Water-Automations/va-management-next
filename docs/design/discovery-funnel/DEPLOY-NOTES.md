# Discovery Funnel — Deploy Notes

Cloudflare Access: add /discover and /api/discover to the bypass list (same as /apply, /sign, /intake).

These routes are public (leads are not logged in). The bypass is configured in the
Cloudflare Zero Trust dashboard (Access → Applications → the team app → policies),
not in this repo — there is no in-repo middleware/public-paths list. Without the
bypass, visitors hit the Google login wall and cannot reach the form or submit a lead.
