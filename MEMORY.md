# Memory

- CORS configuration in `bittasker-nestjs/src/main.ts` is fixed to validate and allow only trusted origins, with credential-safe handling and preflight support.
- `origin/master` is synchronized with the GitLab remote and the production deployment was triggered successfully from the linked Railway API service.
- Production authentication on `https://bittasker.com` is verified working after the CORS fix and production redeploy.
