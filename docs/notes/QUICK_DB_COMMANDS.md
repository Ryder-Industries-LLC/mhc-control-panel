# Quick Commands

## Database Commands

### Quick count

`docker exec mhc-db psql -U mhc_user -d mhc_control_panel -c "SELECT COUNT(*) FROM media_locator;"`

### View recent records (10 most recent)

`docker exec mhc-db psql -U mhc_user -d mhc_control_panel -c "SELECT id, file_path, source, uploaded_at FROM media_locator ORDER BY uploaded_at DESC LIMIT 10;"`

### View with all columns (limited)

`docker exec mhc-db psql -U mhc_user -d mhc_control_panel -c "SELECT * FROM media_locator LIMIT 5;"`

### Check table schema

`docker exec mhc-db psql -U mhc_user -d mhc_control_panel -c "\d media_locator"`

### Filter by username

`docker exec mhc-db psql -U mhc_user -d mhc_control_panel -c "SELECT id, file_path, source FROM media_locator WHERE file_path LIKE '%justin_badd%' LIMIT 10;"`

### Check verification status

`docker exec mhc-db psql -U mhc_user -d mhc_control_panel -c "SELECT s3_verified, COUNT(*) FROM media_locator WHERE deleted_at IS NULL GROUP BY s3_verified;"`

### Current S3 verification progress

`tail -5 /tmp/s3-verify.log`
