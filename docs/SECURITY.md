# Security

## Secrets Management

### Required Environment Variables
All secrets must be stored in `.env` (never committed to git).

| Variable | Purpose | Source |
|----------|---------|--------|
| `DATABASE_URL` | PostgreSQL connection string | Local/Render config |
| `CB_AUTH_TOKEN` | Chaturbate Events API auth | Chaturbate account |
| `STATBATE_API_TOKEN` | Statbate API auth | Statbate account |
| `CHATURBATE_USERNAME` | Your CB username | Chaturbate account |

### Secret Rotation
- Rotate API tokens if exposed or compromised
- Database credentials managed by Render.com in production

## Access Control

### Production
- Render.com dashboard access required for deployment
- Database access via Render.com console only

### Development
- Local `.env` file for development secrets
- Never commit `.env` files

## Data Handling

### Sensitive Data
- Broadcaster profiles: Public data only
- Messages/interactions: User-generated content, handle with care
- API tokens: Never log or expose

### Data Retention
- Session data: Retained indefinitely
- Event logs: Retained indefinitely
- Profile data: Updated on refresh cycles

## Security Checklist

- [ ] `.env` in `.gitignore`
- [ ] No hardcoded secrets in code
- [ ] API tokens validated before use
- [ ] Database connections use SSL in production
- [ ] Input validation on all API endpoints
