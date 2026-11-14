"""Container health check: the service is healthy when it is ready."""

import os
import sys
import urllib.error
import urllib.request

# Above the 3 s that readiness waits for the database, below the HEALTHCHECK timeout.
TIMEOUT_SECONDS = 4
URL = f"http://127.0.0.1:{os.environ.get('AGENT_PORT', '8080')}/health/ready"

try:
    with urllib.request.urlopen(URL, timeout=TIMEOUT_SECONDS) as response:
        sys.exit(0 if response.status == 200 else 1)
except (urllib.error.URLError, TimeoutError) as error:
    print(f"{URL}: {error}", file=sys.stderr)
    sys.exit(1)
