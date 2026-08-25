[SEVERITY: Critical] POST /studies
  CWE-89: SQL Injection
  CWE-306: Missing Authentication
  CWE-502: Deserialization of Untrusted Data
  EXPLOIT: An attacker can inject malicious SQL via arbitrary JSON body, create arbitrary study records without credentials, or send malicious JSON with `__proto__` pollution or RCE gadgets.
  FIX: Validate and sanitize all user-input data, enforce authentication and proper authorization checks, use parameterized queries, and reject unsafe JSON fields (e.g., `__proto__`, constructor keys) with strict schema validation.

[SEVERITY: Critical] POST /studies/{uid}/series/{filename}
  CWE-22: Path Traversal
  EXPLOIT: An attacker can manipulate the filename parameter (e.g., `../../../../etc/passwd`) to traverse the file system, overwrite sensitive files, or expose system data.
  FIX: Validate filename with regex `^[a-zA-Z0-9\-_]+$`, block path traversal sequences (e.g., `../`), and construct paths using safe APIs (e.g., `path.join` with a fixed base directory).

[SEVERITY: Critical] POST /ai/pubmed-cite
  CWE-918: Server-Side Request Forgery (SSRF)
  EXPLOIT: An attacker can craft requests to internal services (e.g., `http://169.254.169.254/latest/meta-data/iam/security-credentials/role` or `http://localhost:22`) to leak credentials or scan internal networks.
  FIX: Restrict outbound requests to a whitelist of allowed domains (e.g., `eutils.ncbi.nlm.nih.gov` only) and never use raw user input to build the request URL.

[SEVERITY: High] POST /studies/{uid}/dicom
  CWE-20: Improper Input Validation
  CWE-434: Unrestricted Upload of File with Dangerous Type
  EXPLOIT: An attacker can upload malicious DICOM files (e.g., with embedded scripts, executable extensions, or out-of-bounds slice indices) to tamper with data or execute arbitrary code.
  FIX: Enforce `.dcm` extension, validate DICOM magic number (first 128 bytes), scan for malicious content, enforce size/format limits, and validate slice indices against study metadata.

[SEVERITY: High] GET /studies/{uid}/dicom
  CWE-200: Information Disclosure
  CWE-359: Exposure of Private Personal Information (PII)
  EXPLOIT: An attacker can access sensitive DICOM files containing PHI without proper authorization.
  FIX: Implement JWT or session-based authentication and authorization checks before serving DICOM files, and use secure transmission methods.

[SEVERITY: High] All POST endpoints (e.g., /studies, /ai/vision-analyze, /ai/impression)
  CWE-352: Cross-Site Request Forgery (CSRF)
  EXPLOIT: A logged-in user can be tricked into submitting forged requests, performing unwanted actions (e.g., creating studies or triggering AI analysis) on their behalf.
  FIX: Implement CSRF tokens or same-site cookie restrictions for all state-changing endpoints.

[SEVERITY: High] POST /ai/vision-analyze
  CWE-20: Improper Input Validation
  EXPLOIT: An attacker can pass out-of-bounds `slice_index` values to access unauthorized DICOM slices.
  FIX: Validate `slice_index` against study metadata (e.g., `0 <= index < total_slices`).